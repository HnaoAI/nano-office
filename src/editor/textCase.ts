// Majuscules et minuscules dans l'éditeur (T2.4) : remplace les lettres de la sélection, morceau de
// texte par morceau de texte pour garder la mise en forme, en une seule transaction.
import type { Editor } from "@tiptap/core";
import type { Mark, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { convertCase, type CaseMode } from "../core/textCase";
import { blockText } from "./blockText";

/** Un morceau de texte à remplacer, avec ses marques. */
interface Replacement {
  from: number;
  to: number;
  text: string;
  marks: readonly Mark[];
}

/** Morceaux de texte du bloc qui commence à `contentStart`, compris dans `[from, to)`, à convertir. */
function blockReplacements(
  block: ProseMirrorNode,
  contentStart: number,
  from: number,
  to: number,
  mode: CaseMode,
): Replacement[] {
  const text = blockText(block);
  const result: Replacement[] = [];
  block.forEach((child, offset) => {
    if (!child.isText) return;
    const start = Math.max(offset, from - contentStart);
    const end = Math.min(offset + child.nodeSize, to - contentStart);
    if (start >= end) return;
    const converted = convertCase(text, start, end, mode);
    if (converted === text.slice(start, end)) return;
    result.push({
      from: contentStart + start,
      to: contentStart + end,
      text: converted,
      marks: child.marks,
    });
  });
  return result;
}

/**
 * Passe le texte sélectionné en majuscules, en minuscules, avec une majuscule en début de phrase ou
 * au début de chaque mot (critères 1 et 2). Les lettres elles-mêmes changent, pas leur affichage.
 * Chaque morceau de texte garde ses marques (critère 4), la sélection reste la même, et tout se fait
 * en une transaction : un Ctrl/Cmd+Z annule le changement en une fois (critère 5).
 * @returns faux sans sélection (sans effet, critère 2) ou si rien ne change
 */
export function changeCase(editor: Editor, mode: CaseMode): boolean {
  const { state } = editor;
  const { selection } = state;
  if (selection.empty) return false;
  const replacements: Replacement[] = [];
  for (const range of selection.ranges) {
    const from = range.$from.pos;
    const to = range.$to.pos;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return true;
      replacements.push(...blockReplacements(node, pos + 1, from, to, mode));
      return false;
    });
  }
  if (replacements.length === 0) return false;
  const tr = state.tr;
  for (const { from, to, text, marks } of replacements.reverse()) {
    tr.replaceWith(from, to, state.schema.text(text, marks));
  }
  // La sélection garde ses bords : le début reste avant le texte converti, la fin après, même si
  // la conversion l'allonge (« ß » donne « SS »).
  if (selection instanceof TextSelection) {
    const forward = selection.anchor <= selection.head;
    const anchor = tr.mapping.map(selection.anchor, forward ? -1 : 1);
    const head = tr.mapping.map(selection.head, forward ? 1 : -1);
    tr.setSelection(TextSelection.create(tr.doc, anchor, head));
  } else {
    tr.setSelection(selection.map(tr.doc, tr.mapping));
  }
  editor.view.dispatch(tr);
  return true;
}
