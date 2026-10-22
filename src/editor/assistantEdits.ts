// Texte sélectionné envoyé à l'assistant (T3.1), suivi de ce texte pendant la demande, et insertion
// d'une traduction (critère 12). Sans React ; les propositions de correction sont dans suggestions.ts.
import type { Editor } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { yUndoPluginKey } from "@tiptap/y-tiptap";
import type * as Y from "yjs";

/** Une plage du document, en positions de ProseMirror. */
export interface DocRange {
  from: number;
  to: number;
}

/** Le texte sélectionné dans un bloc de texte (paragraphe, titre, élément de liste, cellule). */
export interface SelectedParagraph extends DocRange {
  /** Texte de la plage `[from, to)`. */
  text: string;
  /** Bloc qui contient la plage, en entier : une frappe dans ce bloc annule les propositions (critère 10). */
  block: DocRange;
}

/**
 * Texte sélectionné, paragraphe par paragraphe (critère 6). Les images et les tableaux eux-mêmes
 * n'en font pas partie, seulement le texte de leurs cellules ; les paragraphes vides sont écartés.
 */
export function selectedParagraphs(state: EditorState): SelectedParagraph[] {
  const result: SelectedParagraph[] = [];
  for (const range of state.selection.ranges) {
    const from = range.$from.pos;
    const to = range.$to.pos;
    if (from === to) continue;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return true;
      const start = Math.max(from, pos + 1);
      const end = Math.min(to, pos + node.nodeSize - 1);
      const text = end > start ? state.doc.textBetween(start, end) : "";
      if (text.trim() !== "") {
        result.push({ from: start, to: end, text, block: { from: pos, to: pos + node.nodeSize } });
      }
      return false;
    });
  }
  // Une sélection de cellules donne la cellule de tête en premier : remise dans l'ordre du texte.
  return result.sort((a, b) => a.from - b.from);
}

/**
 * Plages suivies à travers une transaction. Une transaction qui touche l'une d'elles rend null :
 * le texte concerné a changé, ce qui était proposé ne s'y applique plus (critère 10).
 * @param ranges plages en positions du document avant la transaction
 * @returns les plages en positions du nouveau document, ou null
 */
export function mapRanges<T extends DocRange>(tr: Transaction, ranges: T[]): T[] | null {
  let current = ranges;
  for (const map of tr.mapping.maps) {
    let touched = false;
    map.forEach((oldStart, oldEnd) => {
      if (current.some((range) => oldStart <= range.to && oldEnd >= range.from)) touched = true;
    });
    if (touched) return null;
    current = current.map((range) => ({
      ...range,
      from: map.map(range.from, 1),
      to: map.map(range.to, -1),
    }));
  }
  return current;
}

/**
 * Suit des plages pendant une demande à l'assistant ou l'affichage d'une traduction.
 * @returns `current()` (plages à jour, ou null si le texte concerné a changé) et `stop()`
 */
export function watchRanges<T extends DocRange>(editor: Editor, ranges: T[]) {
  let current: T[] | null = ranges;
  const onTransaction = ({ transaction }: { transaction: Transaction }) => {
    if (current && transaction.docChanged) current = mapRanges(transaction, current);
  };
  editor.on("transaction", onTransaction);
  return {
    current: () => current,
    stop: () => {
      editor.off("transaction", onTransaction);
    },
  };
}

/**
 * Envoie une transaction comme une étape d'annulation à elle seule : elle ne se fond ni avec la frappe
 * qui précède ni avec celle qui suit (critères 9 et 12). Sans Yjs (tests), envoie simplement.
 */
export function dispatchAsOneStep(editor: Editor, tr: Transaction): void {
  const undoManager = yUndoPluginKey.getState(editor.state)?.undoManager as
    Y.UndoManager | undefined;
  undoManager?.stopCapturing();
  editor.view.dispatch(tr);
  undoManager?.stopCapturing();
}

/** Paragraphes au format JSON de Tiptap : du texte seul, jamais du HTML (critère 16). */
function paragraphNodes(paragraphs: string[]) {
  return paragraphs.map((text) => ({
    type: "paragraph",
    content: text === "" ? [] : [{ type: "text", text }],
  }));
}

/** Remplace le texte d'une plage dans son bloc, avec la mise en forme de son premier caractère. */
function replaceText(tr: Transaction, range: DocRange, text: string): void {
  const marks = tr.doc.nodeAt(range.from)?.marks ?? [];
  if (text === "") tr.delete(range.from, range.to);
  else tr.replaceWith(range.from, range.to, tr.doc.type.schema.text(text, marks));
}

/**
 * « Remplacer la sélection » par la traduction, en une étape d'annulation (critère 12).
 * Chaque paragraphe envoyé reçoit sa traduction dans son propre bloc, avec la mise en forme de son
 * premier caractère : titres, listes, cellules et alignements restent en place, et les blocs non
 * envoyés (images, tableaux) ne sont jamais touchés.
 * Réponse non alignée : un seul paragraphe envoyé est coupé en autant de paragraphes ; sinon toute la
 * traduction va dans le premier paragraphe et le texte des suivants est retiré, sans retirer leurs blocs.
 * @param ranges plages des paragraphes envoyés, dans l'ordre du texte
 * @param aligned vrai si la réponse donne un paragraphe par paragraphe envoyé
 */
export function replaceWithParagraphs(
  editor: Editor,
  ranges: DocRange[],
  paragraphs: string[],
  aligned: boolean,
): void {
  const { state } = editor;
  const [only] = ranges;
  if (!only) return;
  const tr = state.tr;
  if (ranges.length === 1 && paragraphs.length > 1) {
    // Paragraphes ouverts aux deux bouts : le premier continue le texte avant la sélection, le dernier
    // reprend le texte qui la suit, sans paragraphe vide en plus.
    const nodes = paragraphNodes(paragraphs).map((json) => state.schema.nodeFromJSON(json));
    tr.replace(only.from, only.to, new Slice(Fragment.from(nodes), 1, 1));
  } else {
    const texts =
      aligned && paragraphs.length === ranges.length
        ? paragraphs
        : ranges.map((_, index) => (index === 0 ? paragraphs.join(" ") : ""));
    // De la fin vers le début : chaque remplacement laisse intactes les positions qui le précèdent.
    for (let index = ranges.length - 1; index >= 0; index -= 1) {
      const range = ranges[index];
      if (range) replaceText(tr, range, texts[index] ?? "");
    }
  }
  dispatchAsOneStep(editor, tr);
}

/**
 * « Insérer après » : la traduction en nouveaux paragraphes, après le bloc du dernier paragraphe envoyé
 * (dans le même élément de liste ou la même cellule), en une étape d'annulation (critère 12).
 */
export function insertParagraphsAfter(
  editor: Editor,
  ranges: DocRange[],
  paragraphs: string[],
): void {
  const range = ranges[ranges.length - 1];
  if (!range) return;
  const { state } = editor;
  const $end = state.doc.resolve(range.to);
  const position = $end.parent.isTextblock ? $end.after() : range.to;
  const nodes = paragraphNodes(paragraphs).map((json) => state.schema.nodeFromJSON(json));
  dispatchAsOneStep(editor, state.tr.insert(position, nodes));
}
