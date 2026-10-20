// Raccourcis de mise en forme de Nano Buro, reconnus à la touche physique (`event.code`) et non au
// caractère produit (`event.key`), pour fonctionner sur un clavier AZERTY (décision du 2026-10-18).
// Les raccourcis équivalents de Tiptap sont retirés dans src/core/schema.ts.
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { BlockStyleLevel, TextAlignment } from "../core/schema";
import { setAlignment } from "./alignment";
import { setBlockStyle } from "./blockStyle";
import { indentListItem, outdentListItem, toggleList } from "./lists";
import { isMacPlatform } from "./platform";

/** Touches modificatrices d'un raccourci. `mod` est Cmd sur Mac, Ctrl ailleurs. */
interface Modifiers {
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/**
 * Un raccourci : la touche physique, ses modificateurs exacts, et l'action lancée. L'action renvoie
 * faux si la touche ne la concerne pas (Tab hors d'une liste) : le navigateur la traite alors.
 */
interface Shortcut extends Modifiers {
  code: string;
  run: (editor: Editor) => boolean;
}

/**
 * Raccourcis des titres (T1.1, critère 4) : Cmd+Option+chiffre sur Mac, Ctrl+Shift+chiffre ailleurs.
 * Sur Mac, Cmd+Shift+3 à 5 sont les captures d'écran. Sous Windows, Ctrl+Alt est AltGr.
 */
function headingShortcuts(mac: boolean): Shortcut[] {
  const levels: BlockStyleLevel[] = [0, 1, 2, 3];
  return levels.map((level) => ({
    code: `Digit${String(level)}`,
    mod: true,
    ...(mac ? { alt: true } : { shift: true }),
    run: (editor: Editor) => {
      setBlockStyle(level)(editor.state, editor.view.dispatch);
      return true;
    },
  }));
}

/** Raccourcis des listes (T1.2, critères 2 et 5) : Ctrl/Cmd+Shift+8 et 7, Tab et Shift+Tab. */
const LIST_SHORTCUTS: Shortcut[] = [
  {
    code: "Digit8",
    mod: true,
    shift: true,
    run: (editor) => {
      toggleList(editor, "bulletList");
      return true;
    },
  },
  {
    code: "Digit7",
    mod: true,
    shift: true,
    run: (editor) => {
      toggleList(editor, "orderedList");
      return true;
    },
  },
  { code: "Tab", run: indentListItem },
  { code: "Tab", shift: true, run: outdentListItem },
];

/**
 * Raccourcis d'alignement (T1.3, critère 2), ceux de Google Docs : Ctrl/Cmd+Shift+L, E, R, J.
 * Toujours consommés dans l'éditeur, pour ne pas ouvrir la console, les téléchargements ou
 * recharger la page (Chrome et Edge laissent la page les intercepter).
 */
const ALIGNMENT_SHORTCUTS: Shortcut[] = (
  [
    ["KeyL", "left"],
    ["KeyE", "center"],
    ["KeyR", "right"],
    ["KeyJ", "justify"],
  ] as [string, TextAlignment][]
).map(([code, alignment]) => ({
  code,
  mod: true,
  shift: true,
  run: (editor: Editor) => {
    setAlignment(editor, alignment);
    return true;
  },
}));

/** Liste de tous les raccourcis, pour la plateforme donnée. */
export function formatShortcuts(mac: boolean): Shortcut[] {
  return [...headingShortcuts(mac), ...LIST_SHORTCUTS, ...ALIGNMENT_SHORTCUTS];
}

/**
 * Vrai si l'événement correspond exactement au raccourci : même touche physique et mêmes
 * modificateurs, aucun en plus.
 * INVARIANT : sous Windows, AltGr envoie Ctrl et Alt ensemble ; aucun raccourci n'utilise Ctrl+Alt,
 * donc un caractère tapé avec AltGr ne déclenche jamais rien (T1.1, critère 5).
 */
export function matchesShortcut(event: KeyboardEvent, shortcut: Shortcut, mac: boolean): boolean {
  const mod = mac ? event.metaKey : event.ctrlKey;
  const other = mac ? event.ctrlKey : event.metaKey;
  return (
    event.code === shortcut.code &&
    mod === Boolean(shortcut.mod) &&
    !other &&
    event.shiftKey === Boolean(shortcut.shift) &&
    event.altKey === Boolean(shortcut.alt)
  );
}

/**
 * Extension qui installe les raccourcis. Priorité haute : elle passe avant les raccourcis des
 * autres extensions. Un raccourci dont l'action renvoie vrai est consommé (`preventDefault`), même
 * si rien ne change, pour qu'il n'ouvre pas une fonction du navigateur.
 */
export const FormatShortcuts = Extension.create({
  name: "formatShortcuts",
  priority: 1000,
  addProseMirrorPlugins() {
    const mac = isMacPlatform();
    const shortcuts = formatShortcuts(mac);
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("formatShortcuts"),
        props: {
          handleKeyDown(_view, event) {
            const shortcut = shortcuts.find((candidate) => matchesShortcut(event, candidate, mac));
            return shortcut ? shortcut.run(editor) : false;
          },
        },
      }),
    ];
  },
});
