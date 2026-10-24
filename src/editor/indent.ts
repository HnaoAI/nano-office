// Retrait des paragraphes dans l'éditeur (T2.14) : boutons « Diminuer le retrait » et « Augmenter le retrait ».
// Dans une liste, ils décalent l'élément comme Tab et Shift+Tab (src/editor/lists.ts) ; ailleurs, ils changent
// l'attribut `indent` des paragraphes et titres sélectionnés (src/core/indent.ts).
import type { Editor } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { indentLevel, INDENT_TYPES, MAX_INDENT } from "../core/indent";
import { currentListType, indentListItem, outdentListItem } from "./lists";

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
 * ou Shift+Tab ; ailleurs, décale les paragraphes et titres sélectionnés de 1,25 cm, jusqu'à 5 niveaux.
 * INVARIANT : Tab et Shift+Tab ne changent jamais le retrait hors d'une liste (critère 2) : seuls ces boutons
 * l'appellent.
 * @returns vrai si quelque chose a changé ou si le curseur est dans une liste
 */
export function changeIndent(editor: Editor, delta: 1 | -1): boolean {
  if (currentListType(editor.state) !== null) {
    return delta > 0 ? indentListItem(editor) : outdentListItem(editor);
  }
  const tr = indentTransaction(editor.state, delta);
  if (!tr) return false;
  editor.view.dispatch(tr);
  return true;
}

/** État des deux boutons : vrai si l'action peut changer quelque chose (toujours vrai dans une liste). */
export function indentAvailability(state: EditorState): { increase: boolean; decrease: boolean } {
  if (currentListType(state) !== null) return { increase: true, decrease: true };
  const levels = indentableBlocks(state).map(({ level }) => level);
  return {
    increase: levels.some((level) => level < MAX_INDENT),
    decrease: levels.some((level) => level > 0),
  };
}
