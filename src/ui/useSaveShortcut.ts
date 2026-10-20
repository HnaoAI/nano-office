// Raccourci Ctrl+S (Windows) ou Cmd+S (Mac) sur toute la page (T0c, critère 6), sorti de
// useDocumentFile.ts pour garder ce fichier court (lot B).
import { useEffect, useEffectEvent } from "react";

/** Vrai pour Ctrl+S (Windows) ou Cmd+S (Mac), sans autre touche de modification. */
function isSaveShortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "s"
  );
}

/**
 * Appelle `onSave` à chaque Ctrl/Cmd+S. Le raccourci est intercepté sur toute la page, en phase de
 * capture, avant l'éditeur : la fenêtre « Enregistrer la page » du navigateur ne s'ouvre jamais (critère 6).
 */
export function useSaveShortcut(onSave: () => void) {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!isSaveShortcut(event)) return;
    event.preventDefault();
    onSave();
  });
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
