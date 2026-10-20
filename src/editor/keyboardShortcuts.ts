// Raccourcis de mise en forme de Nano Buro, reconnus à la touche physique (`event.code`) et non au
// caractère produit (`event.key`), pour fonctionner sur un clavier AZERTY (décision du 2026-10-18).
// Les raccourcis équivalents de Tiptap sont retirés dans src/core/schema.ts.
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type Command } from "@tiptap/pm/state";
import type { BlockStyleLevel } from "../core/schema";
import { setBlockStyle } from "./blockStyle";
import { isMacPlatform } from "./platform";

/** Touches modificatrices d'un raccourci. `mod` est Cmd sur Mac, Ctrl ailleurs. */
interface Modifiers {
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/** Un raccourci : la touche physique, ses modificateurs exacts, et la commande lancée. */
interface Shortcut extends Modifiers {
  code: string;
  command: Command;
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
    command: setBlockStyle(level),
  }));
}

/** Liste de tous les raccourcis, pour la plateforme donnée. */
export function formatShortcuts(mac: boolean): Shortcut[] {
  return [...headingShortcuts(mac)];
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
 * autres extensions. Un raccourci reconnu est toujours consommé (`preventDefault`), même si la
 * commande ne change rien, pour qu'il n'ouvre pas une fonction du navigateur.
 */
export const FormatShortcuts = Extension.create({
  name: "formatShortcuts",
  priority: 1000,
  addProseMirrorPlugins() {
    const mac = isMacPlatform();
    const shortcuts = formatShortcuts(mac);
    return [
      new Plugin({
        key: new PluginKey("formatShortcuts"),
        props: {
          handleKeyDown(view, event) {
            const shortcut = shortcuts.find((candidate) => matchesShortcut(event, candidate, mac));
            if (!shortcut) return false;
            shortcut.command(view.state, view.dispatch, view);
            return true;
          },
        },
      }),
    ];
  },
});
