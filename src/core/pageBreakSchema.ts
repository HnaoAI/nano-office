// Nœud « saut de page » du document (T2.8), partagé par le format de fichier et l'éditeur. Sans accès au
// navigateur : l'insertion (Ctrl/Cmd+Entrée, bouton) est dans src/editor/pageBreak.ts.
import { Node } from "@tiptap/core";

/** Nom du nœud dans le document (JSON de Tiptap, fichier `.nano`, Y.Doc). */
export const PAGE_BREAK_NODE = "pageBreak";

/**
 * Groupe propre aux sauts de page, à la place du groupe « block ».
 * INVARIANT : une cellule (`block+`) et un élément de liste (`paragraph block*`) n'acceptent que le
 * groupe « block » : un saut de page se place toujours entre deux blocs du document, comme une image,
 * jamais dans un tableau ni dans une liste. Seul le document l'accepte (tableSchema.ts).
 */
export const PAGE_BREAK_GROUP = "documentPageBreak";

/** Attribut HTML qui reconnaît un saut de page de Nano Buro, dans un collage interne. */
export const PAGE_BREAK_ATTRIBUTE = "data-page-break";

/**
 * Saut de page manuel (critères 6 à 8) : un bloc sans texte (atome), sélectionnable d'un clic, qui porte
 * son identifiant de bloc (`id`, par l'extension du schéma). Nouveau type de contenu, sans changement de
 * version du format, comme au lot A.
 * Rendu HTML : `<div data-page-break>` avec `break-before: page`, pour qu'il coupe aussi la page à
 * l'impression et dans un e-mail. Le libellé « Saut de page » vient de la feuille de style (pas de texte
 * dans le document, ni dans une copie vers une autre application).
 * Lu depuis un `<br>` ou un `<hr>` marqué `page-break-before: always` (Word, Google Docs) entre deux
 * blocs ; dans un paragraphe, ou sur un autre élément, src/editor/clipboard.ts le convertit avant.
 */
export const PageBreakNode = Node.create({
  name: PAGE_BREAK_NODE,
  group: PAGE_BREAK_GROUP,
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [
      { tag: `div[${PAGE_BREAK_ATTRIBUTE}]` },
      {
        tag: "br",
        getAttrs: (element) => (isPageBreakStyle(element.getAttribute("style")) ? null : false),
      },
      {
        tag: "hr",
        getAttrs: (element) => (isPageBreakStyle(element.getAttribute("style")) ? null : false),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        ...HTMLAttributes,
        [PAGE_BREAK_ATTRIBUTE]: "",
        class: "nano-page-break",
        style: "break-before: page; page-break-before: always",
      },
    ];
  },
});

/**
 * Vrai si un style CSS demande une nouvelle page avant l'élément : `page-break-before: always` (Word,
 * Google Docs) ou `break-before: page`.
 */
export function isPageBreakStyle(style: string | null): boolean {
  if (!style) return false;
  return /(?:^|;)\s*(?:page-break-before\s*:\s*always|break-before\s*:\s*page)\b/i.test(style);
}
