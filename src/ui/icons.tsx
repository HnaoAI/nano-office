// Icônes au trait de l'interface (U1a), en SVG en ligne : 18 px, trait de 1,75 px, couleur du texte.
// Elles sont décoratives (`aria-hidden`) : le bouton qui les porte a son propre nom accessible.
import type { ReactNode } from "react";

/** Cadre commun des icônes, selon la charte (docs/design/README.md, « Icônes »). */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Flèche « Annuler », reprise de la maquette Main.dc.html. */
export function UndoIcon() {
  return (
    <Icon>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </Icon>
  );
}

/** Flèche « Rétablir », reprise de la maquette Main.dc.html. */
export function RedoIcon() {
  return (
    <Icon>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </Icon>
  );
}
