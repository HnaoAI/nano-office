// Icônes au trait de l'interface (U1a, U1b, T1.9 images, T2.1 recherche, T2.3 barré, T2.10 souligné, T2.14 retrait, T2.12 liens, T2.19 encadré, T3.1 assistant, M1 interligne, T2.9 plan), en SVG en ligne : 18 px, trait de 1,75 px, couleur du texte.
// Elles sont décoratives (`aria-hidden`) : le bouton qui les porte a son propre nom accessible.
import type { ReactNode } from "react";

/**
 * Cadre commun des icônes, selon la charte (docs/design/README.md, « Icônes »).
 * @param size taille en pixels : 18 par défaut ; la maquette met 16 pour Fermer et 22 dans la boîte de dialogue
 */
export function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
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

/** Chevron vers le haut : occurrence précédente de la recherche (T2.1). */
export function ChevronUpIcon() {
  return (
    <Icon>
      <path d="m6 15 6-6 6 6" />
    </Icon>
  );
}

/** Chevron vers le bas : occurrence suivante de la recherche (T2.1). */
export function ChevronDownIcon() {
  return (
    <Icon>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

/** Liste à puces, reprise de la maquette Main.dc.html (T1.2). */
export function BulletListIcon() {
  return (
    <Icon>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" />
    </Icon>
  );
}

/** Liste numérotée, reprise de la maquette Main.dc.html (T1.2). */
export function OrderedListIcon() {
  return (
    <Icon>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <path d="M4 5h1.5v4" />
      <path d="M4 15.5c0-.8.7-1.5 1.5-1.5s1.5.6 1.5 1.3c0 1.2-3 1.7-3 3.7h3" />
    </Icon>
  );
}

/** Aligner à gauche, reprise de la maquette Main.dc.html (T1.3). */
export function AlignLeftIcon() {
  return (
    <Icon>
      <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />
    </Icon>
  );
}

/** Interligne (M1) : des lignes, avec une double flèche verticale devant elles. */
export function LineHeightIcon() {
  return (
    <Icon>
      <path d="M11 6h10M11 12h10M11 18h10" />
      <path d="M5 4v16M2.5 6.5 5 4l2.5 2.5M2.5 17.5 5 20l2.5-2.5" />
    </Icon>
  );
}

/** Centrer, reprise de la maquette Main.dc.html (T1.3). */
export function AlignCenterIcon() {
  return (
    <Icon>
      <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />
    </Icon>
  );
}

/** Aligner à droite, reprise de la maquette Main.dc.html (T1.3). */
export function AlignRightIcon() {
  return (
    <Icon>
      <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />
    </Icon>
  );
}

/** Justifier, reprise de la maquette Main.dc.html (T1.3). */
export function AlignJustifyIcon() {
  return (
    <Icon>
      <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </Icon>
  );
}

/** « Souligné » : un U posé sur un trait (T2.10). */
export function UnderlineIcon() {
  return (
    <Icon>
      <path d="M7 4.5v6a5 5 0 0 0 10 0v-6" />
      <path d="M5 20h14" />
    </Icon>
  );
}

/** « Diminuer le retrait » : des lignes et une flèche vers la gauche (T2.14). */
export function IndentDecreaseIcon() {
  return (
    <Icon>
      <path d="M11 6h9M11 10h9M11 14h9M4 18h16" />
      <path d="m7 9-3 3 3 3" />
    </Icon>
  );
}

/** « Augmenter le retrait » : des lignes et une flèche vers la droite (T2.14). */
export function IndentIncreaseIcon() {
  return (
    <Icon>
      <path d="M11 6h9M11 10h9M11 14h9M4 18h16" />
      <path d="m4 9 3 3-3 3" />
    </Icon>
  );
}

/** « Lien » : deux maillons de chaîne (T2.12). */
export function LinkIcon() {
  return (
    <Icon>
      <path d="M10 13.5a4 4 0 0 0 6 .4l2.6-2.6a4 4 0 0 0-5.7-5.7L11.5 7" />
      <path d="M14 10.5a4 4 0 0 0-6-.4l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.4-1.4" />
    </Icon>
  );
}

/** « Encadré » : un carré au trait, avec deux lignes de texte (T2.19). */
export function CalloutIcon() {
  return (
    <Icon>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M7.5 10h9M7.5 14h6" />
    </Icon>
  );
}

/** « Barré » : un S traversé d'un trait (T2.3). */
export function StrikeIcon() {
  return (
    <Icon>
      <path d="M16.5 7.5c-.6-1.8-2.3-3-4.5-3-2.5 0-4.5 1.5-4.5 3.6 0 1.4.8 2.4 2.4 3" />
      <path d="M8 16.5c.6 1.8 2.3 3 4.5 3 2.6 0 4.5-1.5 4.5-3.6 0-.6-.1-1-.4-1.4" />
      <path d="M4 12h16" />
    </Icon>
  );
}

/** Marqueur au trait, pour le bouton « Surlignage » (T1.7). */
export function HighlighterIcon() {
  return (
    <Icon>
      <path d="m9 11-5 5v3h3l5-5" />
      <path d="m9 11 6.5-6.5a2.1 2.1 0 0 1 3 3L12 14" />
      <path d="m9 11 3 3" />
      <path d="M14 20h6" />
    </Icon>
  );
}

/** « Insérer une image » : un cadre, un soleil et une montagne (T1.9). */
export function ImageIcon() {
  return (
    <Icon>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.75" />
      <path d="m20.5 16-5-5L6 19.5" />
    </Icon>
  );
}

/** « Texte de remplacement » : une bulle de texte (T1.9). */
export function AltTextIcon() {
  return (
    <Icon>
      <path d="M4.5 5.5h15v10h-8l-4 3.5v-3.5h-3z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </Icon>
  );
}

/**
 * Feuille et ses marges, du bouton « Mise en page… » de la barre et de la boîte (T2.5).
 * @param size 18 px dans la barre, 22 px dans la boîte
 */
export function PageSetupIcon({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </Icon>
  );
}

/** Plan du document (T2.9, critère 1) : des lignes de titres en retrait, comme un volet de navigation. */
export function OutlineIcon() {
  return (
    <Icon>
      <path d="M4 6h10M8 12h12M8 18h9" />
      <path d="M4 12h.01M4 18h.01" />
    </Icon>
  );
}

/** Saut de page (T2.8, critère 6) : le bas d'une feuille et le haut de la suivante, séparés par un pointillé. */
export function PageBreakIcon() {
  return (
    <Icon>
      <path d="M6 3v6h12V3M6 21v-6h12v6" />
      <path d="M3 12h2M8 12h2M14 12h2M19 12h2" />
    </Icon>
  );
}

/** Sommaire (T2.17, critère 1) : des lignes de titres reliées à leur numéro de page par des points. */
export function TocIcon() {
  return (
    <Icon>
      <path d="M4 6h8M6 12h7M6 18h6" />
      <path d="M15 6h.01M17.5 6h.01M15 12h.01M17.5 12h.01M15 18h.01M17.5 18h.01" />
      <path d="M20 6h.01M20 12h.01M20 18h.01" />
    </Icon>
  );
}

/** Engrenage du bouton « Réglages » (T3.1, critère 1). */
export function GearIcon({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.86 1 1.51 1H21a2 2 0 1 1 0 4h-.09c-.65 0-1.25.4-1.51 1Z" />
    </Icon>
  );
}

/** Coche « Accepter » d'une modification proposée (T3.1, critère 8). */
export function CheckIcon() {
  return (
    <Icon>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  );
}

/** Lignes de texte et coche : puce de la barre des modifications proposées (T3.1, critère 8). */
export function SuggestionIcon() {
  return (
    <Icon>
      <path d="M4 6h12" />
      <path d="M4 11h8" />
      <path d="M4 16h4" />
      <path d="m12 16 3 3 6-7" />
    </Icon>
  );
}
