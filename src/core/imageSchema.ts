// Nœud image du document (T1.9), partagé par le format de fichier et l'éditeur. Sans accès au navigateur :
// l'affichage (contenu, poignées, image manquante) est dans src/editor/imageView.ts.
// Écrit avec `Node.create` de Tiptap plutôt qu'avec @tiptap/extension-image : il aurait fallu en
// remplacer les attributs (`src`), la lecture du HTML et l'affichage, c'est-à-dire tout.
import { Node } from "@tiptap/core";
import { IMAGE_NODE, isImageHash } from "./images";

/**
 * Groupe propre aux images, à la place du groupe « block ».
 * INVARIANT : une cellule (`block+`) et un élément de liste (`paragraph block*`) n'acceptent que le
 * groupe « block » : une image se place toujours entre deux blocs du document (critère 3), jamais dans
 * un tableau (hors périmètre) ni dans une liste. Seul le document l'accepte (tableSchema.ts).
 */
export const IMAGE_GROUP = "documentImage";

/** Options du nœud image. */
export interface ImageNodeOptions {
  /**
   * Adresse `data:` du contenu d'une image, pour la copie vers une autre application ou une autre
   * fenêtre. Fournie par l'éditeur (src/editor/images.ts) ; null pour le schéma sans éditeur.
   */
  imageSource: ((hash: string) => string | null) | null;
}

/** Largeur valide (pixels, entier positif), ou null. */
function readWidth(value: unknown): number | null {
  const width = typeof value === "string" ? Number.parseInt(value, 10) : value;
  return typeof width === "number" && Number.isInteger(width) && width > 0 ? width : null;
}

/**
 * Image : un bloc sans texte (atome), sélectionnable d'un clic et déplaçable (critères 3 et 4).
 * Attributs : `hash` (empreinte du contenu rangé dans le Y.Doc, critère 6), `alt` (texte de
 * remplacement, critère 5), `width` (largeur en pixels choisie aux poignées, ou null pour la taille
 * naturelle), et, par les extensions du schéma, `id` (règle produit 5) et `textAlign` (critère 4).
 * Rendu HTML : `<img data-hash alt width>` ; l'éditeur y ajoute `src` en `data:` pour la copie.
 */
export const ImageNode = Node.create<ImageNodeOptions>({
  name: IMAGE_NODE,
  group: IMAGE_GROUP,
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { imageSource: null };
  },

  addAttributes() {
    return {
      hash: {
        default: null,
        parseHTML: (element) => {
          const hash = element.getAttribute("data-hash");
          return isImageHash(hash) ? hash : null;
        },
        renderHTML: (attributes) =>
          isImageHash(attributes.hash) ? { "data-hash": attributes.hash } : {},
      },
      alt: {
        default: "",
        parseHTML: (element) => element.getAttribute("alt") ?? "",
        renderHTML: (attributes) => ({
          alt: typeof attributes.alt === "string" ? attributes.alt : "",
        }),
      },
      width: {
        default: null,
        parseHTML: (element) => readWidth(element.getAttribute("width")),
        renderHTML: (attributes) => {
          const width = readWidth(attributes.width);
          return width === null ? {} : { width: String(width) };
        },
      },
    };
  },

  parseHTML() {
    // Seules les images de Nano Buro (avec une empreinte) sont lues ici. Une image `data:` collée
    // reçoit son empreinte avant la lecture (src/editor/images.ts) ; une adresse `http…` est ignorée
    // et n'est jamais téléchargée (critère 10).
    return [{ tag: "img[data-hash]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const hash: unknown = node.attrs.hash;
    const src = isImageHash(hash) ? this.options.imageSource?.(hash) : null;
    return ["img", src ? { ...HTMLAttributes, src } : HTMLAttributes];
  },
});
