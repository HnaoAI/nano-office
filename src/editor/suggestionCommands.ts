// Commandes des corrections proposées par l'assistant (T3.1, critères 7 à 10) : afficher, choisir,
// accepter une à une ou toutes ensemble, refuser. Découpé de suggestions.ts (M1), sans changement.
import type { Editor } from "@tiptap/core";
import type { Mark } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import type { ParagraphChange } from "../core/assistant";
import { dispatchAsOneStep, type SelectedParagraph } from "./assistantEdits";
import {
  suggestionPluginKey,
  suggestionState,
  type Suggestion,
  type SuggestionMeta,
} from "./suggestions";

/**
 * Affiche des propositions, sans modifier le document (critère 7). La première devient la proposition
 * choisie. Une liste vide retire les propositions affichées.
 */
export function showSuggestions(editor: Editor, suggestions: Omit<Suggestion, "id">[]): void {
  const meta: SuggestionMeta = {
    type: "set",
    suggestions: suggestions.map((suggestion, index) => ({ ...suggestion, id: index + 1 })),
  };
  editor.view.dispatch(editor.state.tr.setMeta(suggestionPluginKey, meta));
}

/**
 * Propositions dans le document à partir des corrections de chaque paragraphe envoyé : les positions
 * dans le texte d'un paragraphe deviennent des positions du document (un caractère par position).
 */
export function suggestionsFor(
  paragraphs: SelectedParagraph[],
  changes: ParagraphChange[],
): Omit<Suggestion, "id">[] {
  return changes.flatMap(({ paragraph, from, to, removed, insert }) => {
    const sent = paragraphs[paragraph];
    return sent
      ? [{ from: sent.from + from, to: sent.from + to, removed, insert, block: sent.block }]
      : [];
  });
}

/** Retire toutes les propositions, sans rien changer au document (barre fermée, critère 10). */
export function clearSuggestions(editor: Editor): void {
  if (editor.isDestroyed || suggestionState(editor).suggestions.length === 0) return;
  editor.view.dispatch(
    editor.state.tr.setMeta(suggestionPluginKey, { type: "clear" } satisfies SuggestionMeta),
  );
}

/** Choisit une proposition et fait défiler la page jusqu'à elle (navigation, critère 8). */
export function activateSuggestion(editor: Editor, id: number, scroll = true): void {
  const meta: SuggestionMeta = { type: "activate", id, scroll };
  editor.view.dispatch(editor.state.tr.setMeta(suggestionPluginKey, meta));
}

/** Choisit la proposition suivante (`1`) ou précédente (`-1`), en revenant au début après la dernière. */
export function goToSuggestion(editor: Editor, direction: 1 | -1): void {
  const { suggestions, active } = suggestionState(editor);
  if (suggestions.length === 0) return;
  const index = suggestions.findIndex((suggestion) => suggestion.id === active);
  const next = suggestions[(index + direction + suggestions.length) % suggestions.length];
  if (next) activateSuggestion(editor, next.id);
}

/** Mise en forme du texte ajouté : celle du premier caractère remplacé, ou celle du texte qui précède. */
function marksFor(tr: Transaction, suggestion: Suggestion): readonly Mark[] {
  if (suggestion.to > suggestion.from) return tr.doc.nodeAt(suggestion.from)?.marks ?? [];
  const $position = tr.doc.resolve(suggestion.from);
  return ($position.nodeBefore ?? $position.nodeAfter)?.marks ?? [];
}

/**
 * Accepte des propositions : elles s'appliquent au document en une seule étape d'annulation, même
 * toutes ensemble (critère 9). Le texte qui ne change pas garde sa mise en forme ; un texte remplacé
 * prend la mise en forme du premier caractère qu'il remplace.
 * @param ids propositions à accepter ; `all` pour toutes
 * @returns le nombre de propositions appliquées
 */
export function acceptSuggestions(editor: Editor, ids: number[] | "all"): number {
  const { suggestions } = suggestionState(editor);
  const chosen = suggestions.filter((suggestion) => ids === "all" || ids.includes(suggestion.id));
  if (chosen.length === 0) return 0;
  const tr = editor.state.tr;
  // De la fin vers le début : les positions des propositions précédentes restent justes.
  for (const suggestion of [...chosen].sort((a, b) => b.from - a.from)) {
    if (suggestion.insert === "") {
      tr.delete(suggestion.from, suggestion.to);
    } else {
      const text = editor.state.schema.text(suggestion.insert, marksFor(tr, suggestion));
      tr.replaceWith(suggestion.from, suggestion.to, text);
    }
  }
  tr.setMeta(suggestionPluginKey, {
    type: "remove",
    ids: chosen.map((suggestion) => suggestion.id),
  } satisfies SuggestionMeta);
  dispatchAsOneStep(editor, tr);
  return chosen.length;
}

/** Refuse des propositions : elles disparaissent, le document ne change pas (critère 8). */
export function rejectSuggestions(editor: Editor, ids: number[] | "all"): void {
  const { suggestions } = suggestionState(editor);
  const chosen = suggestions.filter((suggestion) => ids === "all" || ids.includes(suggestion.id));
  if (chosen.length === 0) return;
  const meta: SuggestionMeta = { type: "remove", ids: chosen.map((suggestion) => suggestion.id) };
  editor.view.dispatch(editor.state.tr.setMeta(suggestionPluginKey, meta));
}
