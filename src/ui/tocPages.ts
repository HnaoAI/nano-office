// Derniers numéros de page des titres d'un document (T2.17), mesurés à l'écran par
// useTableOfContents.ts, pour écrire le sommaire de l'export Word avec ses numéros (critère 5).
import type * as Y from "yjs";

const lastPages = new WeakMap<Y.Doc, ReadonlyMap<string, number>>();

/** Retient les numéros de page des titres d'un document. */
export function rememberTocPages(ydoc: Y.Doc, pages: ReadonlyMap<string, number>): void {
  lastPages.set(ydoc, pages);
}

/** Numéros de page des titres d'un document, par identifiant de bloc ; vide s'ils n'ont pas été mesurés. */
export function tocPagesOf(ydoc: Y.Doc): ReadonlyMap<string, number> {
  return lastPages.get(ydoc) ?? new Map();
}
