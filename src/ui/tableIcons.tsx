// Icônes au trait des tableaux (T1.8), dans le style de src/ui/icons.tsx : 18 px, trait de 1,75 px.
// Elles sont décoratives (`aria-hidden`) : chaque bouton a son propre nom accessible.
import type { ReactNode } from "react";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={18}
      height={18}
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

/** Tableau de trois colonnes : bouton « Insérer un tableau ». */
export function TableIcon() {
  return (
    <Icon>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M3 15h18M9 4v16M15 4v16" />
    </Icon>
  );
}

/** Une ligne et un « + » au-dessus. */
export function RowAboveIcon() {
  return (
    <Icon>
      <rect x="3" y="12" width="18" height="8" rx="1.5" />
      <path d="M12 3v6M9 6h6" />
    </Icon>
  );
}

/** Une ligne et un « + » au-dessous. */
export function RowBelowIcon() {
  return (
    <Icon>
      <rect x="3" y="4" width="18" height="8" rx="1.5" />
      <path d="M12 15v6M9 18h6" />
    </Icon>
  );
}

/** Une colonne et un « + » à gauche. */
export function ColumnLeftIcon() {
  return (
    <Icon>
      <rect x="12" y="3" width="8" height="18" rx="1.5" />
      <path d="M3 12h6M6 9v6" />
    </Icon>
  );
}

/** Une colonne et un « + » à droite. */
export function ColumnRightIcon() {
  return (
    <Icon>
      <rect x="4" y="3" width="8" height="18" rx="1.5" />
      <path d="M15 12h6M18 9v6" />
    </Icon>
  );
}

/** Une ligne barrée. */
export function DeleteRowIcon() {
  return (
    <Icon>
      <rect x="3" y="8" width="18" height="8" rx="1.5" />
      <path d="m10 10 4 4M14 10l-4 4" />
    </Icon>
  );
}

/** Une colonne barrée. */
export function DeleteColumnIcon() {
  return (
    <Icon>
      <rect x="8" y="3" width="8" height="18" rx="1.5" />
      <path d="m10 10 4 4M14 10l-4 4" />
    </Icon>
  );
}

/** Un tableau barré. */
export function DeleteTableIcon() {
  return (
    <Icon>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 4v6M15 4v6" />
      <path d="m10 13 4 4M14 13l-4 4" />
    </Icon>
  );
}

/** Un tableau dont la première ligne est marquée d'un trait épais : « Ligne d'en-tête ». */
export function HeaderRowIcon() {
  return (
    <Icon>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M12 10v10" />
      <path d="M7 7h10" strokeWidth="2.5" />
    </Icon>
  );
}
