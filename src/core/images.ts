// Images du document (T1.9), sans accès au navigateur : type reconnu aux premiers octets, empreinte
// SHA-256, règles de réduction, et rangement dans la `Y.Map` « images » du Y.Doc.
// Dépend de Yjs et de lib0 (SHA-256 synchrone, déjà utilisé par Yjs).
import { digest } from "lib0/hash/sha256";
import type * as Y from "yjs";
import type { DocumentJson } from "./types";

/**
 * Nom de la `Y.Map` du Y.Doc qui range le contenu des images, sous leur empreinte.
 * Elle suit le document dans la copie de secours (y-indexeddb) et le suivra dans la collaboration.
 * INVARIANT : le fichier `.nano` ne l'enregistre pas dans `ydoc`, mais dans `images` (voir fileFormat.ts).
 */
export const IMAGES_MAP_NAME = "images";

/** Nom du nœud image du schéma. */
export const IMAGE_NODE = "image";

/** Formats acceptés à l'insertion (critère 1). */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/** Format d'une image. */
export type ImageType = (typeof IMAGE_TYPES)[number];

/** Taille au-delà de laquelle un fichier est refusé (critère 2). */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** Grand côté maximal d'une image insérée, en pixels (critère 2). */
export const MAX_IMAGE_SIDE = 2000;

/** Qualité du réencodage JPEG d'une photo (critère 2). */
export const JPEG_QUALITY = 0.85;

/** Contenu d'une image, tel que rangé dans la `Y.Map` « images ». */
export interface StoredImage {
  type: ImageType;
  data: Uint8Array;
}

/** Vrai si `value` est un des formats acceptés. */
export function isImageType(value: unknown): value is ImageType {
  return typeof value === "string" && (IMAGE_TYPES as readonly string[]).includes(value);
}

/**
 * Reconnaît le format d'une image à ses premiers octets, sans se fier au nom ni au type annoncé.
 * @returns le format, ou null si ce n'est ni du JPEG, ni du PNG, ni du WebP, ni du GIF
 */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  const starts = (signature: number[], offset = 0) =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, index) => bytes[offset + index] === byte);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  // « RIFF », taille sur 4 octets, puis « WEBP ».
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

/** Empreinte SHA-256 du contenu d'une image, en hexadécimal minuscule (64 caractères, critère 6). */
export function imageHash(data: Uint8Array): string {
  return Array.from(digest(data), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Vrai si `value` a la forme d'une empreinte SHA-256 en hexadécimal. */
export function isImageHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/** Décision de réencodage d'une image à l'insertion (critère 2). */
export interface ImageEncoding {
  /** Taille finale en pixels. */
  width: number;
  height: number;
  /** Faux : les octets d'origine sont gardés tels quels. */
  reencode: boolean;
  /** Format final. */
  type: ImageType;
}

/**
 * Règles de réduction du critère 2 :
 * - au-delà de 2 000 px sur le grand côté, l'image est réduite à 2 000 px, proportions gardées ;
 * - une image réduite avec transparence devient un PNG, une autre (photo) un JPEG de qualité 0,85 ;
 * - une image déjà petite garde ses octets d'origine, sauf un GIF, dont seule la première image est
 *   gardée : il devient un PNG (critère 1), ce qui garde aussi sa transparence.
 * @param transparent vrai si l'image a au moins un pixel transparent (lu par l'appelant)
 */
export function planImageEncoding(image: {
  type: ImageType;
  width: number;
  height: number;
  transparent: boolean;
}): ImageEncoding {
  const side = Math.max(image.width, image.height);
  const scale = side > MAX_IMAGE_SIDE ? MAX_IMAGE_SIDE / side : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  if (scale === 1 && image.type !== "image/gif") {
    return { width, height, reencode: false, type: image.type };
  }
  const keepsAlpha = image.transparent || image.type === "image/gif";
  return { width, height, reencode: true, type: keepsAlpha ? "image/png" : "image/jpeg" };
}

/** `Y.Map` des images d'un document. */
function imagesOf(ydoc: Y.Doc): Y.Map<unknown> {
  return ydoc.getMap(IMAGES_MAP_NAME);
}

/**
 * Range une image dans le Y.Doc, une seule fois : une image déjà rangée n'est pas réécrite (critère 6).
 * @returns son empreinte, à mettre dans l'attribut `hash` du nœud image
 */
export function storeImage(ydoc: Y.Doc, image: StoredImage): string {
  const hash = imageHash(image.data);
  if (!readImage(ydoc, hash)) putImage(ydoc, hash, image);
  return hash;
}

/**
 * Range une image sous une empreinte déjà connue (lecture d'un fichier), sans la recalculer.
 * Réservé à `parseDocument`, qui lit un Y.Doc neuf.
 */
export function putImage(ydoc: Y.Doc, hash: string, image: StoredImage): void {
  imagesOf(ydoc).set(hash, { type: image.type, data: image.data });
}

/**
 * Image rangée sous `hash`, ou null si elle manque ou si elle est abîmée (critère 9).
 * INVARIANT : renvoie toujours le même objet `data` pour une même entrée, ce qui permet de garder
 * en cache sa version base64 (voir fileFormat.ts).
 */
export function readImage(ydoc: Y.Doc, hash: string): StoredImage | null {
  const value = imagesOf(ydoc).get(hash);
  if (typeof value !== "object" || value === null) return null;
  const { type, data } = value as Record<string, unknown>;
  return isImageType(type) && data instanceof Uint8Array ? { type, data } : null;
}

/** Vrai si le Y.Doc range au moins une image, utilisée ou non. */
export function hasStoredImages(ydoc: Y.Doc): boolean {
  return imagesOf(ydoc).size > 0;
}

/** Retire du Y.Doc toutes les images rangées (réservé à la copie enregistrée dans `ydoc`, fileFormat.ts). */
export function removeAllImages(ydoc: Y.Doc): void {
  const images = imagesOf(ydoc);
  ydoc.transact(() => {
    for (const hash of Array.from(images.keys())) images.delete(hash);
  });
}

/** Empreintes des images présentes dans un document, sans doublon, dans l'ordre du document. */
export function imageRefs(node: DocumentJson): string[] {
  const found = new Set<string>();
  const visit = (current: DocumentJson) => {
    const hash = current.attrs?.hash;
    if (current.type === IMAGE_NODE && isImageHash(hash)) found.add(hash);
    current.content?.forEach(visit);
  };
  visit(node);
  return Array.from(found);
}

/**
 * Texte de remplacement proposé pour une image (critère 5) : le nom du fichier sans son extension,
 * ou une chaîne vide pour une image collée sans nom.
 */
export function defaultAltText(fileName: string | null | undefined): string {
  if (!fileName) return "";
  const base = fileName.replace(/^.*[\\/]/, "");
  return base.replace(/\.[^.]+$/, "") || base;
}
