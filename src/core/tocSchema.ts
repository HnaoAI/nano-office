// Nœud « sommaire » du document (T2.17), partagé par le format de fichier et l'éditeur. Sans accès au
// navigateur : l'affichage des lignes et l'insertion sont dans src/editor/toc.ts.
import { Node } from "@tiptap/core";

/** Nom du nœud dans le document (JSON de Tiptap, fichier `.nano`, Y.Doc). */
export const TOC_NODE = "tableOfContents";

/**
 * Groupe propre au sommaire, à la place du groupe « block ».
 * INVARIANT : une cellule (`block+`), un élément de liste et un encadré n'acceptent pas ce groupe : le
 * sommaire se place toujours entre deux blocs du document, comme une image ou un saut de page. Seul le
 * document l'accepte (tableSchema.ts).
 */
export const TOC_GROUP = "documentTableOfContents";

/** Attribut HTML qui reconnaît un sommaire de Nano Buro, dans un collage interne. */
export const TOC_ATTRIBUTE = "data-table-of-contents";

/** Titre affiché en tête du sommaire. */
export const TOC_TITLE = "Sommaire";

/**
 * Sommaire automatique (critère 4) : un bloc sans texte (atome), qu'on sélectionne et qu'on supprime
 * comme une image, et qui porte son identifiant de bloc (`id`, par l'extension du schéma). Ses lignes ne
 * sont pas dans le document : elles sont calculées à partir des titres et affichées par l'éditeur, donc
 * jamais modifiées à la main ni comptées dans les mots (T2.11). Nouveau type de contenu, sans
 * changement de version du format, comme le saut de page (T2.8).
 */
export const TableOfContentsNode = Node.create({
  name: TOC_NODE,
  group: TOC_GROUP,
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: `nav[${TOC_ATTRIBUTE}]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["nav", { ...HTMLAttributes, [TOC_ATTRIBUTE]: "", class: "nano-toc" }];
  },
});
