// Icônes au trait de l'aide (A1) : celles des boutons de l'application, reprises de icons.tsx et
// tableIcons.tsx, et quelques icônes propres à l'aide (bouton « Aide », installation, dossier…),
// dessinées dans le même cadre. Elles remplacent les captures d'écran (charte de A1).
import type { ReactNode } from "react";
import {
  BackupIcon,
  BulletListIcon,
  FileIcon,
  GearIcon,
  HighlighterIcon,
  Icon,
  ImageIcon,
  LineHeightIcon,
  PageSetupIcon,
} from "../icons";
import { TableIcon } from "../tableIcons";

/** Point d'interrogation dans un cercle : bouton « Aide » de l'en-tête (critère 1). */
export function HelpIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.5a2.5 2.5 0 0 1 4.85.85c0 1.65-2.45 2.2-2.45 3.65" />
      <path d="M12 17h.01" />
    </Icon>
  );
}

/** Petit écran avec une flèche : icône d'installation de la barre d'adresse. */
function InstallIcon() {
  return (
    <Icon>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 7.5v6" />
      <path d="m9.5 11 2.5 2.5 2.5-2.5" />
    </Icon>
  );
}

/** Dossier : dossier synchronisé. */
function FolderIcon() {
  return (
    <Icon>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </Icon>
  );
}

/** Coche dans un cercle : enregistrement automatique. */
function SavedIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.8 2.8L16.5 9.5" />
    </Icon>
  );
}

/** « T » : style du paragraphe, titres. */
function HeadingIcon() {
  return (
    <Icon>
      <path d="M5 6h14" />
      <path d="M12 6v13" />
    </Icon>
  );
}

/** Imprimante. */
function PrintIcon() {
  return (
    <Icon>
      <path d="M7 9V4h10v5" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M7 14h10v6H7z" />
    </Icon>
  );
}

/** Flèches en cercle : mise à jour. */
function UpdateIcon() {
  return (
    <Icon>
      <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
      <path d="M20 20v-4h-4" />
    </Icon>
  );
}

/** Cadenas : confidentialité. */
function LockIcon() {
  return (
    <Icon>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Icon>
  );
}

const HELP_ICONS = {
  install: InstallIcon,
  folder: FolderIcon,
  save: SavedIcon,
  backup: BackupIcon,
  heading: HeadingIcon,
  list: BulletListIcon,
  color: HighlighterIcon,
  table: TableIcon,
  image: ImageIcon,
  lineHeight: LineHeightIcon,
  page: () => <PageSetupIcon />,
  print: PrintIcon,
  word: FileIcon,
  update: UpdateIcon,
  lock: LockIcon,
  settings: () => <GearIcon />,
} satisfies Record<string, () => ReactNode>;

/** Nom d'une icône de l'aide. */
export type HelpIconName = keyof typeof HELP_ICONS;

/** Icône de l'aide, par son nom. */
export function HelpBlockIcon({ name }: { name: HelpIconName }) {
  const Drawn = HELP_ICONS[name];
  return <Drawn />;
}
