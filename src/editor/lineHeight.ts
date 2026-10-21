// Interligne des paragraphes dans l'éditeur (T2.2) : application aux blocs sélectionnés et lecture
// de l'interligne du curseur pour la liste « Interligne » de la barre.
import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { LINE_HEIGHT_TYPES, type LineHeight } from "../core/lineHeight";

/**
 * Applique un interligne au paragraphe du curseur, ou à tous les paragraphes, titres, éléments de
 * liste et cellules sélectionnés (critère 2), en une seule étape d'annulation (critère 7).
 * null (« Par défaut ») retire l'attribut (critère 4).
 */
export function setLineHeight(editor: Editor, value: LineHeight | null): boolean {
  return editor
    .chain()
    .command(({ commands }) =>
      LINE_HEIGHT_TYPES.map((type) => commands.updateAttributes(type, { lineHeight: value })).some(
        Boolean,
      ),
    )
    .run();
}

/**
 * Interligne commun des blocs sélectionnés : une valeur, `"default"` sans attribut, ou null s'ils en
 * mélangent plusieurs (la liste reste alors vide, critère 5).
 */
export function currentLineHeight(state: EditorState): string | null {
  const found = new Set<string>();
  for (const range of state.selection.ranges) {
    state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node) => {
      if (!node.isTextblock) return true;
      const value: unknown = node.attrs.lineHeight;
      found.add(typeof value === "string" ? value : "default");
      return false;
    });
  }
  const [only] = found;
  return found.size === 1 && only !== undefined ? only : null;
}
