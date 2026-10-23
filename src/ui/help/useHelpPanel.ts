// Ouverture et fermeture du panneau d'aide (A1, critère 1) : bouton « Aide », raccourci Ctrl/Cmd+/ sur
// toute la page, en phase de capture comme les autres raccourcis, et retour du focus à la fermeture.
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";

/**
 * Vrai pour Ctrl+/ (Windows) ou Cmd+/ (Mac), jamais avec AltGr (Ctrl+Alt). Reconnu à la touche physique
 * du / d'un clavier QWERTY, comme les autres raccourcis (journal du 2026-10-18), ou au caractère « / »,
 * qui demande Shift sur un clavier AZERTY (Shift+:).
 */
export function isHelpShortcut(event: KeyboardEvent): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return false;
  return (event.code === "Slash" && !event.shiftKey) || event.key === "/";
}

/**
 * État du panneau d'aide.
 * @param onOpen appelé à chaque ouverture : le panneau compte comme une boîte ouverte pour la mise à jour (H1)
 * @returns `open`, `toggle`, `close` (qui rend le focus à l'élément actif avant l'ouverture)
 */
export function useHelpPanel(onOpen: () => void) {
  const [open, setOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);

  const show = useCallback(() => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    onOpen();
    setOpen(true);
  }, [onOpen]);

  const close = useCallback(() => {
    setOpen(false);
    returnFocus.current?.focus();
    returnFocus.current = null;
  }, []);

  const toggle = useCallback(() => (open ? close() : show()), [open, close, show]);

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!isHelpShortcut(event)) return;
    event.preventDefault();
    toggle();
  });
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  return { open, toggle, close };
}
