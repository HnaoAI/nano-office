// Défilement de l'éditeur sous la partie figée de l'interface (M1, critère B) : le curseur qui
// descend ou remonte au clavier, ou le texte tapé, n'est jamais caché par la barre de mise en forme.
// Sans React : la hauteur cachée est lue par une fonction fournie par l'interface.
import type { EditorProps } from "@tiptap/pm/view";

/** Espace laissé entre la barre figée et la ligne du curseur après un défilement, en pixels. */
const GAP_BELOW_BAR = 16;
/** Marge par défaut de ProseMirror sur les autres côtés, en pixels. */
const DEFAULT_MARGIN = 5;

/**
 * Réglages de défilement de ProseMirror qui tiennent compte de la partie figée en haut de la fenêtre.
 * ProseMirror relit `scrollThreshold` et `scrollMargin` à chaque défilement : le haut est donc lu par
 * un accesseur, pour suivre la hauteur de la barre (passage sur deux lignes, recherche ouverte…).
 * @param coveredTop hauteur cachée en haut de la fenêtre, en pixels (0 sans partie figée)
 * @returns propriétés à ajouter aux `editorProps` de Tiptap
 */
export function scrollBelowStickyTop(
  coveredTop: () => number,
): Pick<EditorProps, "scrollThreshold" | "scrollMargin"> {
  return {
    scrollThreshold: {
      get top() {
        return coveredTop();
      },
      right: 0,
      bottom: 0,
      left: 0,
    },
    scrollMargin: {
      get top() {
        return coveredTop() + GAP_BELOW_BAR;
      },
      right: DEFAULT_MARGIN,
      bottom: DEFAULT_MARGIN,
      left: DEFAULT_MARGIN,
    },
  };
}
