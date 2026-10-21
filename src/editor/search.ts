// Rechercher et remplacer dans l'éditeur (T2.1) : plugin ProseMirror qui garde le texte cherché,
// les occurrences et l'occurrence active, et les surligne par des décorations.
// INVARIANT : les surlignages sont des décorations, jamais des marques : rien n'entre dans le
// document, ni dans `content`, ni dans `ydoc`, et l'état « Enregistré » ne change pas (critère 7).
import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { findInText, type TextMatch } from "../core/search";
import { blockText } from "./blockText";

/** État de la recherche. */
export interface SearchState {
  query: string;
  caseSensitive: boolean;
  /** Occurrences, en positions du document, dans l'ordre. */
  matches: TextMatch[];
  /** Indice de l'occurrence active, ou -1 sans occurrence. */
  active: number;
  decorations: DecorationSet;
  /** Augmente à chaque demande de défilement vers l'occurrence active. */
  scrollRequest: number;
}

/** Changement demandé au plugin, porté par une transaction. */
interface SearchMeta {
  query?: string;
  caseSensitive?: boolean;
  /** Occurrence active : la première qui commence à cette position ou après (sinon la première). */
  activeFrom?: number;
  /** Avec `activeFrom` : sans occurrence après cette position, aucune n'est active (pas de retour au début). */
  noWrap?: boolean;
  /** Occurrence active, par son indice. */
  active?: number;
  scroll?: boolean;
}

/** Clé du plugin, pour lire son état. */
export const searchPluginKey = new PluginKey<SearchState>("search");

/** Classe d'une occurrence, et de l'occurrence active (src/ui/styles/search.css). */
const MATCH_CLASS = "nano-search-match";
const ACTIVE_CLASS = "nano-search-match-active";

/**
 * Occurrences dans tout le document : titres, listes et cellules compris (critère 7). Une occurrence
 * peut traverser une mise en forme (« bon**jour** », critère 3), jamais deux blocs.
 */
export function findInDocument(
  doc: ProseMirrorNode,
  query: string,
  caseSensitive: boolean,
): TextMatch[] {
  if (query === "") return [];
  const matches: TextMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    for (const match of findInText(blockText(node), query, caseSensitive)) {
      matches.push({ from: pos + 1 + match.from, to: pos + 1 + match.to });
    }
    return false;
  });
  return matches;
}

function firstFrom(matches: TextMatch[], position: number, wrap = true): number {
  if (matches.length === 0) return -1;
  const index = matches.findIndex((match) => match.from >= position);
  return index >= 0 ? index : wrap ? 0 : -1;
}

function decorate(doc: ProseMirrorNode, matches: TextMatch[], active: number): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    matches.map((match, index) =>
      Decoration.inline(match.from, match.to, {
        class: index === active ? `${MATCH_CLASS} ${ACTIVE_CLASS}` : MATCH_CLASS,
      }),
    ),
  );
}

const EMPTY: SearchState = {
  query: "",
  caseSensitive: false,
  matches: [],
  active: -1,
  decorations: DecorationSet.empty,
  scrollRequest: 0,
};

/** Nouvel état après une transaction : recalculé si le document ou la recherche changent. */
function nextState(tr: Transaction, previous: SearchState): SearchState {
  const meta = tr.getMeta(searchPluginKey) as SearchMeta | undefined;
  if (!meta && !tr.docChanged) return previous;
  const query = meta?.query ?? previous.query;
  const caseSensitive = meta?.caseSensitive ?? previous.caseSensitive;
  const matches = findInDocument(tr.doc, query, caseSensitive);
  let active: number;
  if (meta?.active !== undefined) {
    active = matches.length === 0 ? -1 : (meta.active + matches.length) % matches.length;
  } else if (meta?.activeFrom !== undefined) {
    active = firstFrom(matches, meta.activeFrom, !meta.noWrap);
  } else {
    // Document modifié : l'occurrence active reste la même, ou la suivante si elle a disparu.
    // Position prise à gauche (-1) : une annulation de Yjs remplace tout le paragraphe, et une
    // position prise à droite partirait à sa fin, sur l'occurrence d'un autre paragraphe.
    const current = previous.matches[previous.active];
    active = firstFrom(matches, current ? tr.mapping.map(current.from, -1) : 0);
  }
  return {
    query,
    caseSensitive,
    matches,
    active,
    decorations: decorate(tr.doc, matches, active),
    scrollRequest: previous.scrollRequest + (meta?.scroll ? 1 : 0),
  };
}

/** État de la recherche d'un éditeur. */
export function searchState(editor: Editor): SearchState {
  return searchPluginKey.getState(editor.state) ?? EMPTY;
}

/**
 * Sélectionne l'occurrence active et fait défiler la page jusqu'à elle (critère 2). Le focus reste
 * dans la barre de recherche ; Échap le rend au document, à cet endroit (critère 1).
 */
function selectActive(editor: Editor): void {
  const { matches, active } = searchState(editor);
  const match = matches[active];
  if (!match) return;
  const tr = editor.state.tr
    .setSelection(TextSelection.create(editor.state.doc, match.from, match.to))
    .setMeta(searchPluginKey, { scroll: true } satisfies SearchMeta);
  editor.view.dispatch(tr);
}

/**
 * Cherche `query` pendant la frappe (critère 2). L'occurrence active est la première à partir du
 * curseur, pour ne pas sauter loin de l'endroit où l'on travaille.
 */
export function setSearch(editor: Editor, query: string, caseSensitive: boolean): void {
  const meta: SearchMeta = { query, caseSensitive, activeFrom: editor.state.selection.from };
  editor.view.dispatch(editor.state.tr.setMeta(searchPluginKey, meta));
  selectActive(editor);
}

/** Retire la recherche et ses surlignages (barre fermée). */
export function clearSearch(editor: Editor): void {
  if (editor.isDestroyed) return;
  editor.view.dispatch(
    editor.state.tr.setMeta(searchPluginKey, { query: "" } satisfies SearchMeta),
  );
}

/** Va à l'occurrence suivante (`1`) ou précédente (`-1`), en revenant au début après la dernière. */
export function goToMatch(editor: Editor, direction: 1 | -1): void {
  const { active, matches } = searchState(editor);
  if (matches.length === 0) return;
  const meta: SearchMeta = { active: active + direction };
  editor.view.dispatch(editor.state.tr.setMeta(searchPluginKey, meta));
  selectActive(editor);
}

/** Remplace l'occurrence `match` dans `tr`, avec les marques de son premier caractère (critère 5). */
function replaceMatch(tr: Transaction, match: TextMatch, replacement: string): void {
  if (replacement === "") {
    tr.delete(match.from, match.to);
    return;
  }
  const marks = tr.doc.nodeAt(match.from)?.marks ?? [];
  tr.replaceWith(match.from, match.to, tr.doc.type.schema.text(replacement, marks));
}

/**
 * Remplace l'occurrence active, puis passe à la suivante (critère 4). La suivante est cherchée après
 * le texte inséré, sans revenir au début du document : un remplacement qui contient le texte cherché
 * ne boucle pas, même cliqué plusieurs fois (critère 8). Après la dernière, aucune n'est active ;
 * Entrée repart du début.
 * @returns faux sans occurrence active
 */
export function replaceCurrent(editor: Editor, replacement: string): boolean {
  const { matches, active } = searchState(editor);
  const match = matches[active];
  if (!match) return false;
  const tr = editor.state.tr;
  replaceMatch(tr, match, replacement);
  tr.setMeta(searchPluginKey, {
    activeFrom: match.from + replacement.length,
    noWrap: true,
  } satisfies SearchMeta);
  editor.view.dispatch(tr);
  selectActive(editor);
  return true;
}

/**
 * Remplace toutes les occurrences en une seule transaction : un Ctrl/Cmd+Z remet tout (critère 6).
 * Chaque occurrence n'est remplacée qu'une fois, même si le remplacement contient le texte cherché.
 * @returns le nombre de remplacements
 */
export function replaceAll(editor: Editor, replacement: string): number {
  const { matches } = searchState(editor);
  if (matches.length === 0) return 0;
  const tr = editor.state.tr;
  for (const match of [...matches].reverse()) replaceMatch(tr, match, replacement);
  editor.view.dispatch(tr);
  return matches.length;
}

/**
 * Extension qui installe le plugin de recherche. Le défilement vers l'occurrence active passe par
 * `scrollIntoView` du navigateur, centré, pour qu'elle ne reste pas cachée sous la barre de recherche.
 */
export const Search = Extension.create({
  name: "search",
  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchPluginKey,
        state: {
          init: () => EMPTY,
          apply: (tr, previous) => nextState(tr, previous),
        },
        props: {
          decorations: (state) => searchPluginKey.getState(state)?.decorations,
        },
        view: () => ({
          update(view, previousState) {
            const now = searchPluginKey.getState(view.state);
            const before = searchPluginKey.getState(previousState);
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
