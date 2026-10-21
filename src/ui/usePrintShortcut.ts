// Raccourci Ctrl+P (Windows) ou Cmd+P (Mac) sur toute la page (T2.6, critère 1) : ouvre la boîte
// d'impression du navigateur par le même chemin que le bouton « Imprimer ».
import { useEffect, useEffectEvent } from "react";

/**
 * Vrai pour Ctrl+P (Windows) ou Cmd+P (Mac), sans autre touche de modification. Reconnu à la touche
 * physique, comme les autres raccourcis (journal du 2026-10-18) ; jamais avec AltGr (Ctrl+Alt).
 */
export function isPrintShortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === "KeyP"
  );
}

/**
 * Appelle `onPrint` à chaque Ctrl/Cmd+P, en phase de capture, avant l'éditeur.
 * @param onPrint ouvre la boîte d'impression
 */
export function usePrintShortcut(onPrint: () => void) {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!isPrintShortcut(event)) return;
    event.preventDefault();
    onPrint();
  });
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
