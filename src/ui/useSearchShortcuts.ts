// Raccourcis de la barre de recherche (T2.1) sur toute la page : Ctrl/Cmd+F pour rechercher,
// Ctrl+H (Windows) ou Cmd+Option+F (Mac) pour remplacer. Reconnus à la touche physique.
import { useEffect, useEffectEvent } from "react";
import { isMacPlatform } from "../editor/platform";

/** Mode d'ouverture de la barre. */
export type SearchMode = "find" | "replace";

/**
 * Mode demandé par l'événement, ou null s'il ne s'agit pas d'un raccourci de recherche.
 * Cmd+H n'est pas utilisé : il masque l'application sur Mac (critère 4).
 * INVARIANT : sous Windows, aucun raccourci n'utilise Ctrl+Alt, qui équivaut à AltGr.
 */
export function searchShortcut(event: KeyboardEvent, mac: boolean): SearchMode | null {
  const mod = mac ? event.metaKey : event.ctrlKey;
  const other = mac ? event.ctrlKey : event.metaKey;
  if (!mod || other || event.shiftKey) return null;
  if (event.code === "KeyF") {
    if (!event.altKey) return "find";
    return mac ? "replace" : null;
  }
  if (event.code === "KeyH" && !mac && !event.altKey) return "replace";
  return null;
}

/**
 * Ouvre la barre de recherche au raccourci, intercepté sur toute la page en phase de capture :
 * la recherche du navigateur (Ctrl/Cmd+F) et son historique (Ctrl+H) ne s'ouvrent jamais (critère 1).
 */
export function useSearchShortcuts(onOpen: (mode: SearchMode) => void) {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const mode = searchShortcut(event, isMacPlatform());
    if (!mode) return;
    event.preventDefault();
    onOpen(mode);
  });
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
