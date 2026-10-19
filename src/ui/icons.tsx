// Icônes au trait de l'interface (U1a, U1b), en SVG en ligne : 18 px, trait de 1,75 px, couleur du texte.
// Elles sont décoratives (`aria-hidden`) : le bouton qui les porte a son propre nom accessible.
import type { ReactNode } from "react";

/**
 * Cadre commun des icônes, selon la charte (docs/design/README.md, « Icônes »).
 * @param size taille en pixels : 18 par défaut ; la maquette met 16 pour Fermer et 22 dans la boîte de dialogue
 */
function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
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

/** Flèche de retour en arrière : document récupéré (maquette Messages.dc.html). */
export function RecoveredIcon() {
  return (
    <Icon>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </Icon>
  );
}

/** Horloge de la question de la copie de secours (maquette Recuperation.dc.html). */
export function BackupIcon() {
  return (
    <Icon size={22}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 8v4l3 2" />
    </Icon>
  );
}

/** Flèche vers le bas : fichier téléchargé (maquette Messages.dc.html). */
export function DownloadIcon() {
  return (
    <Icon>
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </Icon>
  );
}

/** Feuille : nom du fichier dans la boîte de dialogue (maquette Recuperation.dc.html). */
export function FileIcon() {
  return (
    <Icon>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </Icon>
  );
}

/** Feuille avec un point d'exclamation : fichier abîmé ou illisible (maquette Messages.dc.html). */
export function FileAlertIcon() {
  return (
    <Icon>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M12 12v3" />
      <path d="M12 18h.01" />
    </Icon>
  );
}

/** Triangle d'avertissement : échec d'enregistrement (maquette Messages.dc.html). */
export function WarningIcon() {
  return (
    <Icon>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </Icon>
  );
}

/** Croix du bouton « Fermer le message » (maquette Messages.dc.html). */
export function CloseIcon() {
  return (
    <Icon size={16}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}
