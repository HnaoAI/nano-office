// Outils communs aux tests des images (T1.9) : faux contenus d'image, nœud image, document illustré.
import * as Y from "yjs";
import { bytesToBase64 } from "../../src/core/base64";
import { storeImage, type StoredImage } from "../../src/core/images";
import { YJS_FRAGMENT_NAME } from "../../src/core/schema";
import type { DocumentJson } from "../../src/core/types";
import { paragraph, ydocFromJson } from "./helpers";

/** Signature d'un PNG : seuls les premiers octets comptent pour core/, qui ne décode jamais l'image. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Faux PNG : la signature, puis `size` octets qui dépendent de `seed` (deux graines, deux images). */
export function fakePng(seed: number, size = 64): StoredImage {
  const data = new Uint8Array(PNG_SIGNATURE.length + size);
  data.set(PNG_SIGNATURE);
  for (let i = 0; i < size; i++) data[PNG_SIGNATURE.length + i] = (seed * 31 + i * 7) % 256;
  return { type: "image/png", data };
}

/** Nœud image du document. */
export function imageNode(id: string, hash: string, alt = "", width: number | null = null) {
  return { type: "image", attrs: { id, hash, alt, width, textAlign: null } };
}

/**
 * Y.Doc contenant `content` (sans les images), dont les images sont ensuite rangées comme le fait
 * l'éditeur. Renvoie aussi leurs empreintes, dans l'ordre de `images`.
 */
export function ydocWithImages(
  build: (hashes: string[]) => DocumentJson,
  images: StoredImage[],
): { ydoc: Y.Doc; hashes: string[] } {
  const scratch = new Y.Doc();
  const hashes = images.map((image) => storeImage(scratch, image));
  const ydoc = ydocFromJson(build(hashes));
  images.forEach((image) => storeImage(ydoc, image));
  return { ydoc, hashes };
}

/** Document : un paragraphe, une image, un paragraphe. */
export function illustratedDocument(hash: string, alt = "Photo de vacances"): DocumentJson {
  return {
    type: "doc",
    content: [
      paragraph("p-1", { text: "Avant l'image" }),
      imageNode("img-1", hash, alt),
      paragraph("p-2", { text: "Après l'image" }),
    ],
  };
}

/** Fichier `.nano` version 1, écrit comme le faisait l'application avant T1.9. */
export function versionOneFile(json: DocumentJson, id = "doc-v1"): string {
  const ydoc = ydocFromJson(json);
  return JSON.stringify({
    format: "nano-office",
    version: 1,
    id,
    content: json,
    ydoc: bytesToBase64(Y.encodeStateAsUpdate(ydoc)),
  });
}

/** Nombre de nœuds de type `type` dans le fragment du document. */
export function countNodes(ydoc: Y.Doc, type: string): number {
  let count = 0;
  const visit = (node: Y.XmlElement | Y.XmlFragment) => {
    for (const child of node.toArray()) {
      if (child instanceof Y.XmlElement) {
        if (child.nodeName === type) count++;
        visit(child);
      }
    }
  };
  visit(ydoc.getXmlFragment(YJS_FRAGMENT_NAME));
  return count;
}
