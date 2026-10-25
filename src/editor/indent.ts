// Retrait des paragraphes dans l'éditeur (T2.14) : boutons « Diminuer le retrait » et « Augmenter le retrait ».
// Dans une liste, ils décalent l'élément comme Tab et Shift+Tab (src/editor/lists.ts) ; ailleurs, ils changent
// l'attribut `indent` des paragraphes et titres sélectionnés (src/core/indent.ts). Sur une sélection qui mélange
// les deux, chaque ligne bouge selon sa nature, en une seule transaction (B2).
import type { Editor } from "@tiptap/core";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { liftListItem, sinkListItem } from "@tiptap/pm/schema-list";
import { indentLevel, INDENT_TYPES, MAX_INDENT } from "../core/indent";
import { MAX_LIST_DEPTH } from "../core/schema";
import { currentListType, indentListItem, outdentListItem, selectionListDepth } from "./lists";

/** Positions et niveaux des paragraphes et titres sélectionnés, hors des listes. */
function indentableBlocks(state: EditorState): { pos: number; level: number }[] {
  const blocks: { pos: number; level: number }[] = [];
  for (const range of state.selection.ranges) {
    state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos, parent) => {
      if (node.type.name === "listItem" || node.type.name.endsWith("List")) return false;
      if (!node.isTextblock) return true;
      if (INDENT_TYPES.includes(node.type.name) && parent?.type.name !== "listItem") {
        blocks.push({ pos, level: indentLevel(node.attrs.indent) });
      }
      return false;
    });
  }
  return blocks;
}

/** Morceau de la sélection dans une même liste : du début de sa première ligne à la fin de sa dernière. */
interface ListSegment {
  from: number;
  to: number;
}

/**
 * Morceaux de la sélection pris dans des listes, un par liste de plus haut niveau, dans l'ordre du document.
 * Chacun se décale comme Tab ou Shift+Tab avec ces lignes sélectionnées (B2).
 */
function listSegments(state: EditorState): ListSegment[] {
  const segments = new Map<number, ListSegment>();
  for (const range of state.selection.ranges) {
    state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
      if (!node.isTextblock) return true;
      const $pos = state.doc.resolve(pos);
      let list = -1;
      for (let depth = $pos.depth; depth > 0; depth--) {
        if ($pos.node(depth).type.name.endsWith("List")) list = $pos.before(depth);
      }
      if (list < 0) return false;
      const from = Math.max(pos + 1, range.$from.pos);
      const to = Math.min(pos + node.nodeSize - 1, range.$to.pos);
      const segment = segments.get(list);
      segments.set(list, {
        from: segment ? Math.min(segment.from, from) : from,
        to: segment ? Math.max(segment.to, to) : to,
      });
      return false;
    });
  }
  return [...segments.values()].sort((a, b) => a.from - b.from);
}

/**
 * Transaction d'un morceau de liste décalé comme Tab (1) ou Shift+Tab (-1), calculée sur le document de `tr`, ou
 * null s'il ne peut pas bouger : niveau 3 atteint, ou premier niveau pour Shift+Tab.
 */
function shiftWholeSegment(
  tr: Transaction,
  segment: ListSegment,
  delta: 1 | -1,
): Transaction | null {
  const state = EditorState.create({
    doc: tr.doc,
    selection: TextSelection.create(tr.doc, segment.from, segment.to),
  });
  const item = state.schema.nodes.listItem;
  if (!item) return null;
  let result: Transaction | null = null;
  const capture = (shifted: Transaction) => {
    result = shifted;
  };
  if (delta > 0) {
    if (selectionListDepth(state) < MAX_LIST_DEPTH) sinkListItem(item)(state, capture);
  } else {
    // Seulement vers la liste parente : jamais hors de la liste, même quand la sélection remonte jusqu'à un
    // élément de premier niveau (`liftListItem` en ferait alors des paragraphes).
    const { $from, $to } = state.selection;
    const range = $from.blockRange($to, (node) => node.firstChild?.type === item);
    if (range && range.depth >= 2 && $from.node(range.depth - 1).type === item) {
      liftListItem(item)(state, capture);
    }
  }
  return result;
}

/** Élément de liste du morceau : début de sa première ligne, et indices des éléments du morceau qui le contiennent. */
interface SegmentItem {
  text: number;
  ancestors: number[];
}

/** Éléments de liste dont la première ligne est dans le morceau, dans l'ordre du document. */
function segmentItems(tr: Transaction, segment: ListSegment): SegmentItem[] {
  const items: (SegmentItem & { end: number })[] = [];
  tr.doc.nodesBetween(segment.from, segment.to, (node, pos) => {
    if (node.type.name !== "listItem") return true;
    const first = node.firstChild;
    const text = pos + 2;
    if (first?.isTextblock && text + first.content.size >= segment.from && text <= segment.to) {
      const ancestors = items.flatMap((other, index) => (other.end > pos ? [index] : []));
      items.push({ text, ancestors, end: pos + node.nodeSize });
    }
    return true;
  });
  return items;
}

/**
 * Décale un morceau de liste dans `tr` comme Tab ou Shift+Tab. S'il ne peut pas bouger d'un bloc, chaque élément
 * est essayé seul, dans l'ordre : un élément qui ne peut pas bouger (premier de sa liste, niveau 3, premier niveau)
 * reste en place sans empêcher les autres (B2, critère 2). Les sous-points d'un élément décalé le suivent déjà :
 * ils ne sont pas décalés une seconde fois.
 */
function shiftSegment(tr: Transaction, segment: ListSegment, delta: 1 | -1): void {
  const whole = shiftWholeSegment(tr, segment, delta);
  if (whole) {
    for (const step of whole.steps) tr.step(step);
    return;
  }
  const start = tr.steps.length;
  const moved = new Set<number>();
  segmentItems(tr, segment).forEach((entry, index) => {
    if (entry.ancestors.some((ancestor) => moved.has(ancestor))) return;
    const text = tr.mapping.slice(start).map(entry.text);
    const shifted = shiftWholeSegment(tr, { from: text, to: text }, delta);
    if (!shifted) return;
    moved.add(index);
    for (const step of shifted.steps) tr.step(step);
  });
}

/**
 * Transaction d'une sélection qui mélange liste et paragraphes (B2, critères 1 à 3), ou null si rien ne bouge :
 * les paragraphes et titres changent de retrait, chaque morceau de liste change de niveau quand il le peut.
 * Les retraits d'abord, qui ne déplacent rien, puis les listes de la dernière à la première, pour que les positions
 * des précédentes restent justes.
 */
function mixedIndentTransaction(state: EditorState, delta: 1 | -1): Transaction | null {
  const tr = indentTransaction(state, delta) ?? state.tr;
  for (const segment of listSegments(state).reverse()) shiftSegment(tr, segment, delta);
  return tr.docChanged ? tr : null;
}

/** Vrai si la sélection contient à la fois des lignes de liste et des paragraphes ou titres hors liste (B2). */
function isMixedSelection(state: EditorState): boolean {
  return indentableBlocks(state).length > 0 && listSegments(state).length > 0;
}

/**
 * Transaction qui décale d'un niveau les paragraphes et titres sélectionnés, entre 0 et 5 niveaux, ou null si rien
 * ne change. Une seule transaction : Ctrl/Cmd+Z l'annule en une fois (critère 4).
 * @param delta 1 pour augmenter le retrait, -1 pour le diminuer
 */
export function indentTransaction(state: EditorState, delta: 1 | -1): Transaction | null {
  const tr = state.tr;
  for (const { pos, level } of indentableBlocks(state)) {
    const next = Math.max(0, Math.min(MAX_INDENT, level + delta));
    if (next !== level) tr.setNodeAttribute(pos, "indent", next === 0 ? null : next);
  }
  return tr.docChanged ? tr : null;
}

/**
 * Bouton « Augmenter le retrait » (1) ou « Diminuer le retrait » (-1), critère 1. Dans une liste, fait comme Tab
 * ou Shift+Tab ; ailleurs, décale les paragraphes et titres sélectionnés de 1,25 cm, jusqu'à 5 niveaux ; sur une
 * sélection mixte, les deux à la fois, ligne par ligne (B2).
 * INVARIANT : Tab et Shift+Tab ne changent jamais le retrait hors d'une liste (critère 2) : seuls ces boutons
 * l'appellent.
 * @returns vrai si quelque chose a changé ou si le curseur est dans une liste
 */
export function changeIndent(editor: Editor, delta: 1 | -1): boolean {
  if (isMixedSelection(editor.state)) {
    const tr = mixedIndentTransaction(editor.state, delta);
    if (!tr) return false;
    editor.view.dispatch(tr);
    return true;
  }
  if (currentListType(editor.state) !== null) {
    return delta > 0 ? indentListItem(editor) : outdentListItem(editor);
  }
  const tr = indentTransaction(editor.state, delta);
  if (!tr) return false;
  editor.view.dispatch(tr);
  return true;
}

/**
 * État des deux boutons : vrai si l'action peut changer quelque chose (toujours vrai dans une liste). Sur une
 * sélection mixte, vrai dès qu'une ligne peut bouger (B2, critère 4).
 */
export function indentAvailability(state: EditorState): { increase: boolean; decrease: boolean } {
  if (isMixedSelection(state)) {
    return {
      increase: mixedIndentTransaction(state, 1) !== null,
      decrease: mixedIndentTransaction(state, -1) !== null,
    };
  }
  if (currentListType(state) !== null) return { increase: true, decrease: true };
  const levels = indentableBlocks(state).map(({ level }) => level);
  return {
    increase: levels.some((level) => level < MAX_INDENT),
    decrease: levels.some((level) => level > 0),
  };
}
