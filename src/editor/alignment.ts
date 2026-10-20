// Alignement des paragraphes et des titres (T1.3) : commande et lecture de l'état, sur les
// commandes de l'extension TextAlign de Tiptap.
import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import type { TextAlignment } from "../core/schema";

/**
 * Aligne le paragraphe du curseur, ou tous les blocs sélectionnés (T1.3, critère 3), en une seule
 * étape d'annulation. « Gauche » retire l'attribut, car c'est l'alignement par défaut (critère 6).
 */
export function setAlignment(editor: Editor, alignment: TextAlignment): boolean {
  return alignment === "left"
    ? editor.commands.unsetTextAlign()
    : editor.commands.setTextAlign(alignment);
}

/** Alignement commun des blocs sélectionnés, ou null s'ils en mélangent plusieurs. */
export function currentAlignment(state: EditorState): TextAlignment | null {
  const { from, to } = state.selection;
  const found = new Set<TextAlignment>();
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isTextblock) return true;
    const value = node.attrs.textAlign as TextAlignment | null | undefined;
    found.add(value ?? "left");
    return false;
  });
  const [only] = found;
  return found.size === 1 && only !== undefined ? only : null;
}
