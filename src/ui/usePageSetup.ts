// Hooks React de la mise en page du document affiché (T2.5), des numéros de page (T2.15), de l'en-tête et
// du pied de page (T2.16) : relisent la `Y.Map` « page » à chaque changement, y compris une annulation.
// La logique est dans src/core/pageSetup.ts et src/core/headerFooter.ts.
import { useCallback, useRef, useSyncExternalStore } from "react";
import type * as Y from "yjs";
import { readHeaderFooter, type HeaderFooter } from "../core/headerFooter";
import { PAGE_MAP_NAME, readPageSetup, type PageSetup } from "../core/pageSetup";

/** Valeur lue dans la `Y.Map` « page », même objet tant qu'elle ne change pas. */
function usePageMapValue<T>(ydoc: Y.Doc, readValue: (ydoc: Y.Doc) => T): T {
  const cache = useRef<{ key: string; value: T } | null>(null);
  const subscribe = useCallback(
    (onChange: () => void) => {
      const map = ydoc.getMap(PAGE_MAP_NAME);
      map.observe(onChange);
      return () => map.unobserve(onChange);
    },
    [ydoc],
  );
  const read = () => {
    const value = readValue(ydoc);
    const key = JSON.stringify(value);
    if (cache.current?.key !== key) cache.current = { key, value };
    return cache.current.value;
  };
  return useSyncExternalStore(subscribe, read);
}

/**
 * Mise en page actuelle d'un Y.Doc, mise à jour à chaque changement.
 * @param ydoc document affiché
 * @returns la mise en page (même objet tant qu'elle ne change pas)
 */
export function usePageSetup(ydoc: Y.Doc): PageSetup {
  return usePageMapValue(ydoc, readPageSetup);
}

/**
 * Numéros de page, en-tête et pied de page actuels d'un Y.Doc, mis à jour à chaque changement.
 * @param ydoc document affiché
 * @returns les réglages (même objet tant qu'ils ne changent pas)
 */
export function useHeaderFooter(ydoc: Y.Doc): HeaderFooter {
  return usePageMapValue(ydoc, readHeaderFooter);
}
