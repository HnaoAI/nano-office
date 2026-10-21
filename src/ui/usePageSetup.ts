// Hook React de la mise en page du document affiché (T2.5) : relit la `Y.Map` « page » à chaque
// changement, y compris une annulation. La logique est dans src/core/pageSetup.ts.
import { useCallback, useRef, useSyncExternalStore } from "react";
import type * as Y from "yjs";
import { PAGE_MAP_NAME, readPageSetup, type PageSetup } from "../core/pageSetup";

/**
 * Mise en page actuelle d'un Y.Doc, mise à jour à chaque changement.
 * @param ydoc document affiché
 * @returns la mise en page (même objet tant qu'elle ne change pas)
 */
export function usePageSetup(ydoc: Y.Doc): PageSetup {
  const cache = useRef<{ key: string; setup: PageSetup } | null>(null);
  const subscribe = useCallback(
    (onChange: () => void) => {
      const map = ydoc.getMap(PAGE_MAP_NAME);
      map.observe(onChange);
      return () => map.unobserve(onChange);
    },
    [ydoc],
  );
  const read = () => {
    const setup = readPageSetup(ydoc);
    const key = JSON.stringify(setup);
    if (cache.current?.key !== key) cache.current = { key, setup };
    return cache.current.setup;
  };
  return useSyncExternalStore(subscribe, read);
}
