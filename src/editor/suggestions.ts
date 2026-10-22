// Corrections proposées par l'assistant (T3.1, critères 7 à 10) : plugin ProseMirror qui garde les
// propositions, les affiche par des décorations et les applique une à une ou toutes ensemble.
// INVARIANT : une proposition est une décoration, jamais une marque ni un nœud : tant qu'elle n'est
// pas acceptée, rien n'entre dans le document, ni dans `content`, ni dans `ydoc` (critère 7).
import { Extension, type Editor } from "@tiptap/core";
import type { Mark } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { ParagraphChange } from "../core/assistant";
import {
  dispatchAsOneStep,
  mapRanges,
  type DocRange,
  type SelectedParagraph,
} from "./assistantEdits";

/** Une modification proposée : remplacer `[from, to)` (texte `removed`) par `insert`. */
export interface Suggestion extends DocRange {
  id: number;
  removed: string;
  insert: string;
  /** Bloc qui contient la modification : le modifier fait disparaître les propositions (critère 10). */
  block: DocRange;
}

/** État des propositions d'un éditeur. */
export interface SuggestionState {
  suggestions: Suggestion[];
  /** Proposition choisie (clic, navigation), qui porte les boutons Accepter et Refuser. */
  active: number | null;
  decorations: DecorationSet;
  /** Augmente à chaque demande de défilement vers la proposition choisie. */
  scrollRequest: number;
}

type SuggestionMeta =
  | { type: "set"; suggestions: Suggestion[] }
  | { type: "clear" }
  | { type: "activate"; id: number; scroll: boolean }
  | { type: "remove"; ids: number[] };

/** Clé du plugin, pour lire son état. */
export const suggestionPluginKey = new PluginKey<SuggestionState>("suggestions");

/** Classes des marques de suggestion (src/ui/styles/assistant.css). */
const REMOVED_CLASS = "nano-suggest-removed";
const INSERTED_CLASS = "nano-suggest-inserted";
const ACTIVE_CLASS = "nano-suggest-active";

const EMPTY: SuggestionState = {
  suggestions: [],
  active: null,
  decorations: DecorationSet.empty,
  scrollRequest: 0,
};

/** Texte ajouté, affiché à sa place : du texte seul (`textContent`), jamais du HTML (critère 16). */
function insertedWidget(suggestion: Suggestion, active: boolean) {
  return () => {
    const span = document.createElement("span");
    span.className = active ? `${INSERTED_CLASS} ${ACTIVE_CLASS}` : INSERTED_CLASS;
    span.dataset.suggestion = String(suggestion.id);
    span.textContent = suggestion.insert;
    return span;
  };
}

function decorate(state: EditorState, suggestions: Suggestion[], active: number | null) {
  if (suggestions.length === 0) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  for (const suggestion of suggestions) {
    const isActive = suggestion.id === active;
    if (suggestion.to > suggestion.from) {
      decorations.push(
        Decoration.inline(suggestion.from, suggestion.to, {
          class: isActive ? `${REMOVED_CLASS} ${ACTIVE_CLASS}` : REMOVED_CLASS,
          "data-suggestion": String(suggestion.id),
        }),
      );
    }
    if (suggestion.insert !== "") {
      decorations.push(
        Decoration.widget(suggestion.to, insertedWidget(suggestion, isActive), {
          side: -1,
          ignoreSelection: true,
          key: `suggestion-${suggestion.id}-${isActive ? "active" : "idle"}`,
        }),
      );
    }
  }
  return DecorationSet.create(state.doc, decorations);
}

/** Proposition qui suit `removed` dans l'ordre du texte, ou la dernière, pour garder la navigation. */
function nextActive(previous: SuggestionState, kept: Suggestion[]): number | null {
  if (kept.length === 0) return null;
  if (kept.some((suggestion) => suggestion.id === previous.active)) return previous.active;
  const index = previous.suggestions.findIndex((suggestion) => suggestion.id === previous.active);
  const after = previous.suggestions
    .slice(index + 1)
    .find((suggestion) => kept.some((entry) => entry.id === suggestion.id));
  return after?.id ?? kept[kept.length - 1]?.id ?? null;
}

/** Plage suivie à travers une transaction, ses bords gardés du côté du texte qu'elle couvre. */
function mapRange(tr: Transaction, range: DocRange): DocRange {
  const from = tr.mapping.map(range.from, 1);
  return { from, to: Math.max(from, tr.mapping.map(range.to, -1)) };
}

function nextState(
  tr: Transaction,
  previous: SuggestionState,
  state: EditorState,
): SuggestionState {
  const meta = tr.getMeta(suggestionPluginKey) as SuggestionMeta | undefined;
  if (!meta && (!tr.docChanged || previous.suggestions.length === 0)) return previous;
  let suggestions = previous.suggestions;
  let active = previous.active;
  let scrollRequest = previous.scrollRequest;
  if (meta?.type === "set") {
    suggestions = meta.suggestions;
    active = suggestions[0]?.id ?? null;
    scrollRequest += 1;
  } else if (meta?.type === "clear") {
    return EMPTY;
  } else if (meta?.type === "activate") {
    active = meta.id;
    if (meta.scroll) scrollRequest += 1;
  } else {
    if (meta?.type === "remove") {
      const kept = suggestions.filter((suggestion) => !meta.ids.includes(suggestion.id));
      active = nextActive(previous, kept);
      suggestions = kept;
    } else if (
      !mapRanges(
        tr,
        suggestions.map((suggestion) => suggestion.block),
      )
    ) {
      // Modification de l'utilisateur dans un bloc concerné : toutes les propositions restantes
      // disparaissent, sans rien changer (critère 10).
      return EMPTY;
    }
    if (suggestions.length === 0) return EMPTY;
    suggestions = suggestions.map((suggestion) => ({
      ...suggestion,
      ...mapRange(tr, suggestion),
      block: mapRange(tr, suggestion.block),
    }));
    // Sécurité : une proposition dont le texte ne correspond plus n'est jamais appliquée.
    if (
      suggestions.some((entry) => state.doc.textBetween(entry.from, entry.to) !== entry.removed)
    ) {
      return EMPTY;
    }
  }
  return { suggestions, active, decorations: decorate(state, suggestions, active), scrollRequest };
}

/** État des propositions d'un éditeur. */
export function suggestionState(editor: Editor): SuggestionState {
  return suggestionPluginKey.getState(editor.state) ?? EMPTY;
}

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

/**
 * Extension qui installe le plugin des propositions. Un clic sur une proposition la choisit
 * (critère 8) ; le défilement vers la proposition choisie passe par `scrollIntoView` du navigateur.
 */
export const Suggestions = Extension.create({
  name: "suggestions",
  addProseMirrorPlugins() {
    return [
      new Plugin<SuggestionState>({
        key: suggestionPluginKey,
        state: {
          init: () => EMPTY,
          apply: (tr, previous, _old, state) => nextState(tr, previous, state),
        },
        props: {
          decorations: (state) => suggestionPluginKey.getState(state)?.decorations,
          handleDOMEvents: {
            mousedown: (view, event) => {
              const target = event.target instanceof Element ? event.target : null;
              const marked = target?.closest("[data-suggestion]");
              if (!(marked instanceof HTMLElement)) return false;
              const id = Number(marked.dataset.suggestion);
              view.dispatch(
                view.state.tr.setMeta(suggestionPluginKey, {
                  type: "activate",
                  id,
                  scroll: false,
                } satisfies SuggestionMeta),
              );
              return false;
            },
          },
        },
        view: () => ({
          update(view, previousState) {
            const now = suggestionPluginKey.getState(view.state);
            const before = suggestionPluginKey.getState(previousState);
            if (!now || now.scrollRequest === before?.scrollRequest) return;
            const active = view.dom.querySelector(`.${ACTIVE_CLASS}`);
            // jsdom (tests) n'a pas scrollIntoView.
            if (active && "scrollIntoView" in active) {
              active.scrollIntoView({ block: "center", inline: "nearest" });
            }
          },
        }),
      }),
    ];
  },
});
