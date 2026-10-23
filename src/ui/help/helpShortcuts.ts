// Tableau des raccourcis clavier de l'aide (A1, critère 3.7), affiché avec les touches de l'ordinateur
// utilisé (⌘ et ⌥ sur Mac, Ctrl et Shift sur PC). Les raccourcis de mise en forme viennent de la liste
// réelle (src/editor/keyboardShortcuts.ts) ; ceux de la page sont décrits ici, et
// tests/ui/helpShortcuts.test.ts vérifie que chacun déclenche bien l'action réelle.
import { formatShortcuts } from "../../editor/keyboardShortcuts";

/** Un raccourci : touche physique (`event.code`) et modificateurs exacts. `mod` est Cmd sur Mac, Ctrl ailleurs. */
export interface HelpShortcut {
  label: string;
  code: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/** Groupe de lignes du tableau. */
export interface HelpShortcutGroup {
  title: string;
  shortcuts: HelpShortcut[];
}

/** Raccourcis du document, écoutés sur toute la page (T0c, T2.1, T2.6, A1). */
function documentShortcuts(mac: boolean): HelpShortcut[] {
  return [
    { label: "Enregistrer", code: "KeyS", mod: true },
    { label: "Imprimer ou créer un PDF", code: "KeyP", mod: true },
    { label: "Rechercher", code: "KeyF", mod: true },
    // T2.1, critère 4 : Cmd+H masque l'application sur Mac.
    mac
      ? { label: "Rechercher et remplacer", code: "KeyF", mod: true, alt: true }
      : { label: "Rechercher et remplacer", code: "KeyH", mod: true },
    { label: "Ouvrir ou fermer l'aide", code: "Slash", mod: true },
  ];
}

/** Annuler et rétablir, ceux de l'extension de collaboration de Tiptap. */
const EDIT_SHORTCUTS: HelpShortcut[] = [
  { label: "Annuler", code: "KeyZ", mod: true },
  { label: "Rétablir", code: "KeyZ", mod: true, shift: true },
];

/** Gras et italique, ceux de Tiptap. */
const MARK_SHORTCUTS: HelpShortcut[] = [
  { label: "Gras", code: "KeyB", mod: true },
  { label: "Italique", code: "KeyI", mod: true },
];

/**
 * Raccourcis affichés dans l'aide, par groupe.
 * @param mac vrai sur Mac (`isMacPlatform`)
 */
export function helpShortcutGroups(mac: boolean): HelpShortcutGroup[] {
  const format = formatShortcuts(mac).map(({ label, code, mod, shift, alt }) => ({
    label,
    code,
    mod,
    shift,
    alt,
  }));
  return [
    { title: "Document", shortcuts: documentShortcuts(mac) },
    { title: "Modifier", shortcuts: EDIT_SHORTCUTS },
    { title: "Mise en forme", shortcuts: [...MARK_SHORTCUTS, ...format] },
  ];
}

/** Nom affiché d'une touche physique : `Digit1` → 1, `KeyX` → X, `Slash` → /. */
function keyName(code: string): string {
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Key")) return code.slice(3);
  if (code === "Slash") return "/";
  return code;
}

/**
 * Touches d'un raccourci, à la façon de l'ordinateur : `⌥⌘1` sur Mac (ordre d'Apple), `Ctrl+Shift+1` ailleurs.
 * @param shortcut raccourci à afficher
 * @param mac vrai sur Mac
 */
export function shortcutKeys(shortcut: HelpShortcut, mac: boolean): string {
  const key = keyName(shortcut.code);
  if (mac) {
    return `${shortcut.alt ? "⌥" : ""}${shortcut.shift ? "⇧" : ""}${shortcut.mod ? "⌘" : ""}${key}`;
  }
  const parts = [shortcut.mod && "Ctrl", shortcut.alt && "Alt", shortcut.shift && "Shift", key];
  return parts.filter(Boolean).join("+");
}
