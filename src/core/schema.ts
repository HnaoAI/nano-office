// Schéma du document, source unique partagée par le format de fichier (T0a) et l'éditeur (T0b).
// Dépend de Tiptap (extensions gratuites, licence MIT) ; aucun accès au navigateur.
import { Extension, getSchema } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
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

/** Types de nœuds qui portent un identifiant de bloc. T1.x ajoutera titres, listes et cellules. */
export const BLOCK_TYPES_WITH_ID = ["paragraph"];

/**
 * Extension d'identifiant de bloc : ajoute l'attribut `id` aux paragraphes (règle produit 5).
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
 * Extensions Tiptap qui définissent le contenu d'un document : paragraphes, gras, italique,
 * identifiant de bloc. T0b les réutilise telles quelles, sans redéfinir le schéma.
 */
export const documentExtensions = [Document, Paragraph, Text, Bold, Italic, BlockId];

/** Schéma ProseMirror obtenu à partir de `documentExtensions`, utilisable sans éditeur. */
export const documentSchema = getSchema(documentExtensions);
