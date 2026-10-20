// Style d'un bloc de texte : texte normal ou titre 1 à 3 (T1.1). Commande et lecture de l'état,
// sur l'état ProseMirror, sans React.
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Command, EditorState } from "@tiptap/pm/state";
import type { BlockStyleLevel } from "../core/schema";

/** Blocs de texte touchés par la sélection (paragraphes et titres), avec leur position et leur parent. */
function selectedTextBlocks(
  state: EditorState,
): { node: ProseMirrorNode; pos: number; parent: ProseMirrorNode | null; index: number }[] {
  const { from, to } = state.selection;
  const blocks: {
    node: ProseMirrorNode;
    pos: number;
    parent: ProseMirrorNode | null;
    index: number;
  }[] = [];
  state.doc.nodesBetween(from, to, (node, pos, parent, index) => {
    if (node.type.name === "paragraph" || node.type.name === "heading") {
      blocks.push({ node, pos, parent, index });
      return false;
    }
    return true;
  });
  return blocks;
}

/**
 * Transforme le bloc du curseur, ou tous les blocs sélectionnés, en texte normal (0) ou en titre.
 * INVARIANT : les attributs du bloc (identifiant, alignement) sont conservés (T1.1, critère 10) :
 * `setNodeMarkup` remplace seulement le type et le niveau, en une seule étape d'annulation.
 * Un paragraphe où un titre n'est pas permis (élément de liste) est laissé tel quel.
 * @param level 0 pour le texte normal, 1 à 3 pour un titre
 */
export function setBlockStyle(level: BlockStyleLevel): Command {
  return (state, dispatch) => {
    const { paragraph, heading } = state.schema.nodes;
    if (!paragraph || !heading) return false;
    const type = level === 0 ? paragraph : heading;
    const tr = state.tr;
    for (const { node, pos, parent, index } of selectedTextBlocks(state)) {
      const sameStyle = node.type === type && (level === 0 || node.attrs.level === level);
      const allowed = parent === null || parent.canReplaceWith(index, index + 1, type);
      if (sameStyle || !allowed) continue;
      tr.setNodeMarkup(pos, type, { ...node.attrs, level }, node.marks);
    }
    if (!tr.docChanged) return false;
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

/**
 * Style des blocs sélectionnés : 0 pour le texte normal, 1 à 3 pour un titre, ou null s'ils en
 * mélangent plusieurs (la liste déroulante reste alors vide).
 */
export function currentBlockStyle(state: EditorState): BlockStyleLevel | null {
  const levels = new Set(
    selectedTextBlocks(state).map(({ node }) =>
      node.type.name === "heading" ? (node.attrs.level as BlockStyleLevel) : 0,
    ),
  );
  const [only] = levels;
  return levels.size === 1 && only !== undefined ? only : null;
}
