// Texte d'un bloc de ProseMirror où l'indice de chaque caractère est sa position dans le bloc :
// partagé par les majuscules et minuscules (T2.4) et la recherche (T2.1).
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/** Caractère qui tient la place d'un nœud sans texte (image en ligne d'une version future). */
const LEAF_PLACEHOLDER = "￼";

/**
 * Texte d'un bloc de texte (paragraphe, titre). Le caractère d'indice `i` est à la position
 * `début du contenu + i` du document : un texte trouvé ici se retrouve donc dans le document.
 */
export function blockText(block: ProseMirrorNode): string {
  let text = "";
  block.forEach((child) => {
    text += child.isText ? (child.text ?? "") : LEAF_PLACEHOLDER.repeat(child.nodeSize);
  });
  return text;
}
