// Schéma du document, source unique partagée par le format de fichier (T0a) et l'éditeur (T0b).
// Dépend de Tiptap (extensions gratuites, licence MIT) ; aucun accès au navigateur.
import { Extension, getSchema } from "@tiptap/core";
import Paragraph from "@tiptap/extension-paragraph";
import Heading from "@tiptap/extension-heading";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { isSafeCssValue, TextStyleAttributes } from "./textStyle";
import { DocumentWithTables, tableExtensions } from "./tableSchema";
import { ImageNode } from "./imageSchema";
import Text from "@tiptap/extension-text";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";

/**
 * Nom du fragment Yjs qui contient le document.
 * INVARIANT : l'extension de collaboration de T0b doit utiliser ce même nom (option `field`),
 * sinon l'éditeur et le fichier ne liraient pas le même contenu.
 * "default" est aussi la valeur par défaut de l'extension de collaboration de Tiptap.
 */
export const YJS_FRAGMENT_NAME = "default";

/** Nom de l'attribut qui porte l'identifiant stable d'un bloc. */
export const BLOCK_ID_ATTRIBUTE = "id";

/** Types de nœuds qui portent un identifiant de bloc (règle produit 5), cellules (T1.8) et images (T1.9) comprises. */
export const BLOCK_TYPES_WITH_ID = [
  "paragraph",
  "heading",
  "listItem",
  "tableCell",
  "tableHeader",
  "image",
];

/** Niveaux de titre proposés (T1.1). Les titres 4 à 6 sont hors périmètre. */
export const HEADING_LEVELS = [1, 2, 3] as const;

/** Alignements proposés (T1.3). L'absence d'alignement (null) vaut « gauche », l'alignement par défaut. */
export const TEXT_ALIGNMENTS = ["left", "center", "right", "justify"] as const;

/** Alignement d'un paragraphe ou d'un titre. */
export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];

/** Nombre maximal de niveaux d'une liste (T1.2, critère 5). */
export const MAX_LIST_DEPTH = 3;

/** Niveau d'un titre, ou 0 pour le texte normal. */
export type BlockStyleLevel = 0 | (typeof HEADING_LEVELS)[number];

/**
 * Extension d'identifiant de bloc : ajoute l'attribut `id` aux blocs de `BLOCK_TYPES_WITH_ID` (règle produit 5).
 * Elle ne génère pas les identifiants : `src/editor/blockIds.ts` s'en charge dans l'éditeur.
 * L'attribut est rendu en HTML sous la forme `data-id`.
 */
export const BlockId = Extension.create({
  name: "blockId",
  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES_WITH_ID,
        attributes: {
          [BLOCK_ID_ATTRIBUTE]: {
            default: null,
            // Entrée en fin de paragraphe crée un paragraphe sans identifiant, au lieu d'une copie
            // (T0b, critère 6 ; relecture de la PR n° 14). Tiptap copie quand même les attributs
            // si l'on coupe au milieu : src/editor/blockIds.ts corrige alors le doublon.
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute("data-id"),
            renderHTML: (attributes) => {
              const id: unknown = attributes[BLOCK_ID_ATTRIBUTE];
              return typeof id === "string" ? { "data-id": id } : {};
            },
          },
        },
      },
    ];
  },
});

/**
 * Paragraphe et titres sans leurs raccourcis Tiptap (Mod-Alt-0 à 3), reconnus au caractère produit :
 * sous Windows, Ctrl+Alt équivaut à AltGr, qui tape `@` ou `#` sur un clavier AZERTY (T1.1, critère 5).
 * Les raccourcis de Nano Buro sont dans src/editor/keyboardShortcuts.ts, à la touche physique.
 */
const DocumentParagraph = Paragraph.extend({ addKeyboardShortcuts: () => ({}) });
const DocumentHeading = Heading.extend({ addKeyboardShortcuts: () => ({}) }).configure({
  levels: [...HEADING_LEVELS],
});

/**
 * Listes sans leurs raccourcis Tiptap (Mod-Shift-7 et 8, Tab), remplacés par ceux de
 * src/editor/keyboardShortcuts.ts (touche physique, trois niveaux au plus). Entrée garde le
 * comportement de Tiptap : nouvel élément, ou sortie de la liste sur un élément vide (T1.2, critère 4).
 * Le collage de la liste numérotée est retiré : il transformait un texte « 1. … » collé en liste,
 * une mise en forme automatique interdite (règle produit 6).
 */
const DocumentBulletList = BulletList.extend({ addKeyboardShortcuts: () => ({}) });
const DocumentOrderedList = OrderedList.extend({
  addKeyboardShortcuts: () => ({}),
  addProseMirrorPlugins: () => [],
});
const DocumentListItem = ListItem.extend({
  addKeyboardShortcuts() {
    return { Enter: () => this.editor.commands.splitListItem(this.name) };
  },
});

/**
 * Alignement des paragraphes, des titres (T1.3) et des images (T1.9), dans l'attribut `textAlign`, sans les raccourcis
 * de Tiptap (remplacés par ceux de src/editor/keyboardShortcuts.ts, à la touche physique).
 * L'attribut est gardé quand Entrée coupe le bloc : le nouveau paragraphe reprend l'alignement.
 */
const DocumentTextAlign = TextAlign.extend({ addKeyboardShortcuts: () => ({}) }).configure({
  types: ["paragraph", "heading", "image"],
  alignments: [...TEXT_ALIGNMENTS],
});

/**
 * Surlignage (T1.7) : marque `highlight` multicolore, rendue en `<mark>` avec sa couleur en style
 * (lisible par un e-mail), sans le raccourci Mod-Shift-H de Tiptap, reconnu au caractère produit.
 * La couleur du texte est l'attribut `color` de la marque `textStyle`, à côté de la police et de la
 * taille (src/core/textStyle.ts) : un seul `<span>` porte les trois.
 */
const DocumentHighlight = Highlight.extend({
  addKeyboardShortcuts: () => ({}),
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-color") ?? (element.style.backgroundColor || null),
        // Même contrôle que la couleur du texte : une valeur venue d'un fichier ne doit pas pouvoir
        // ajouter une autre propriété CSS.
        renderHTML: (attributes) => {
          const color: unknown = attributes.color;
          return isSafeCssValue(color)
            ? { "data-color": color, style: `background-color: ${color}; color: inherit` }
            : {};
        },
      },
    };
  },
});

/**
 * Extensions Tiptap qui définissent le contenu d'un document : paragraphes, titres (T1.1), listes à
 * puces et numérotées (T1.2), alignement (T1.3), gras, italique, police et taille (T1.4),
 * couleur du texte et surlignage (T1.7), tableaux (T1.8), images (T1.9), identifiant de bloc. T0b les
 * réutilise telles quelles, sans redéfinir le schéma (l'éditeur configure seulement `ImageNode`).
 */
export const documentExtensions = [
  DocumentWithTables,
  DocumentParagraph,
  DocumentHeading,
  DocumentBulletList,
  DocumentOrderedList,
  DocumentListItem,
  ...tableExtensions,
  ImageNode,
  Text,
  Bold,
  Italic,
  TextStyle,
  TextStyleAttributes,
  DocumentHighlight,
  DocumentTextAlign,
  BlockId,
];

/** Schéma ProseMirror obtenu à partir de `documentExtensions`, utilisable sans éditeur. */
export const documentSchema = getSchema(documentExtensions);
