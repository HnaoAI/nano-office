// Petite fenêtre ouverte par un bouton de la barre (grilles de couleurs T1.7, grille du tableau T1.8) :
// ouverture, fermeture par Échap ou par un clic à côté, et focus rendu au bouton.
import { useEffect, useState } from "react";

/** État d'une petite fenêtre. */
export interface Popover {
  open: boolean;
  /** Ouvre ou ferme la fenêtre. */
  toggle: () => void;
  /** Ferme la fenêtre. */
  close: () => void;
}

/**
 * Gère une petite fenêtre : Échap la ferme et rend le focus au bouton, un clic à côté la ferme
 * (T1.7, critère 2). Une seule est ouverte à la fois, puisque cliquer sur un autre bouton est un clic à côté.
 * @param rootRef conteneur du bouton et de la fenêtre : un clic hors de lui ferme la fenêtre
 * @param buttonRef bouton qui ouvre la fenêtre, qui reprend le focus après Échap
 */
export function usePopover(
  rootRef: React.RefObject<HTMLElement | null>,
  buttonRef: React.RefObject<HTMLButtonElement | null>,
): Popover {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, rootRef, buttonRef]);

  return {
    open,
    toggle: () => setOpen((value) => !value),
    close: () => setOpen(false),
  };
}

/**
 * Déplacement au clavier dans une grille de boutons (flèches, Début, Fin) : renvoie l'indice du
 * bouton à atteindre, ou null si la touche ne déplace pas.
 * @param index bouton qui a le focus
 * @param count nombre de boutons
 * @param columns nombre de colonnes : Haut et Bas sautent d'une ligne
 */
export function gridMove(
  key: string,
  index: number,
  count: number,
  columns: number,
): number | null {
  const moves: Record<string, number> = {
    ArrowLeft: index - 1,
    ArrowRight: index + 1,
    ArrowUp: index - columns,
    ArrowDown: index + columns,
    Home: 0,
    End: count - 1,
  };
  const target = moves[key];
  if (target === undefined) return null;
  return Math.min(Math.max(target, 0), count - 1);
}
