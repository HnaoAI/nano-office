// Format de fichier `.nano` version 2 (T1.9) : sérialisation et lecture, sans accès au navigateur.
// Lit aussi la version 1, migrée par src/core/migrations.ts (critère 7).
// Dépend de Yjs, de @tiptap/y-tiptap (conversions fragment Yjs <-> JSON) et du schéma partagé.
import * as Y from "yjs";
import { prosemirrorJSONToYDoc, yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { base64ToBytes, bytesToBase64 } from "./base64";
import {
  detectImageType,
  hasStoredImages,
  imageHash,
  imageRefs,
  isImageHash,
  isImageType,
  putImage,
  readImage,
  removeAllImages,
} from "./images";
import { migrateToCurrent } from "./migrations";
import { documentSchema, YJS_FRAGMENT_NAME } from "./schema";
import {
  NANO_FORMAT,
  NANO_FORMAT_VERSION,
  type DocumentJson,
  type NanoFileImage,
  type NanoFileV2,
  type ParseResult,
} from "./types";

/** Crée l'identifiant unique d'un nouveau document (UUID version 4). */
export function createDocumentId(): string {
  return crypto.randomUUID();
}

/** Contenu du fragment du document d'un Y.Doc, au format JSON de Tiptap (celui écrit dans `content`). */
export function contentOf(ydoc: Y.Doc): DocumentJson {
  return yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment(YJS_FRAGMENT_NAME)) as DocumentJson;
}

/**
 * Version base64 de chaque contenu d'image déjà enregistré, pour ne pas la recalculer à chaque
 * sauvegarde automatique d'un document de 20 photos (T1.9, critère 11). Clé : l'objet `data` rangé
 * dans le Y.Doc, toujours le même pour une même image (voir `readImage`).
 */
const base64Cache = new WeakMap<Uint8Array, string>();

/** Contenu d'une image en base64, mis en cache. */
function imageBase64(data: Uint8Array): string {
  let encoded = base64Cache.get(data);
  if (encoded === undefined) {
    encoded = bytesToBase64(data);
    base64Cache.set(data, encoded);
  }
  return encoded;
}

/**
 * État Yjs du document, sans le contenu des images (T1.9, critère 6) : elles sont retirées d'une
 * copie du Y.Doc, dont Yjs efface alors le contenu supprimé ; seule la trace de leur retrait reste.
 * Le Y.Doc du document n'est pas modifié : ses images restent dans la copie de secours.
 */
function encodeWithoutImages(ydoc: Y.Doc): Uint8Array {
  const update = Y.encodeStateAsUpdate(ydoc);
  if (!hasStoredImages(ydoc)) return update;
  const copy = new Y.Doc();
  Y.applyUpdate(copy, update);
  removeAllImages(copy);
  return Y.encodeStateAsUpdate(copy);
}

/**
 * Sérialise un document au format `.nano` version 2 (texte JSON à écrire en UTF-8).
 * Les images utilisées par `content` sont rangées une seule fois dans `images` ; une image retirée
 * du document, encore gardée dans le Y.Doc pour Ctrl/Cmd+Z, n'est pas enregistrée (T1.9, critère 6).
 * INVARIANT : `content` est calculé ici à partir du `ydoc`, jamais fourni par l'appelant,
 * pour que les deux ne puissent pas diverger (T0a, critère 5). `parseDocument` s'appuie dessus.
 * @param doc.id identifiant du document, conservé tel quel
 * @param doc.ydoc état du document, lu sans être modifié
 */
export function serializeDocument(doc: { id: string; ydoc: Y.Doc }): string {
  const content = contentOf(doc.ydoc);
  const images: Record<string, NanoFileImage> = {};
  // Triées par empreinte, et non dans l'ordre du document : ajouter ou déplacer une image ne change pas
  // le texte des autres, et le dossier synchronisé n'envoie que la partie modifiée (relecture du lot D).
  for (const hash of imageRefs(content).sort()) {
    const image = readImage(doc.ydoc, hash);
    if (image) images[hash] = { type: image.type, data: imageBase64(image.data) };
  }
  const file: NanoFileV2 = {
    format: NANO_FORMAT,
    version: NANO_FORMAT_VERSION,
    id: doc.id,
    content,
    ydoc: bytesToBase64(encodeWithoutImages(doc.ydoc)),
    // INVARIANT : `images` reste le dernier champ du JSON, pour que les images, lourdes et stables,
    // soient à la fin du fichier.
    images,
  };
  return JSON.stringify(file);
}

/**
 * Lit un fichier `.nano`. Ne lève jamais d'exception : renvoie un succès ou une erreur nommée.
 *
 * `ydoc` est la source de vérité. Comme un `ydoc` abîmé peut s'appliquer sans erreur et donner
 * un document vide ou partiel, son contenu relu est comparé au `content` enregistré :
 * s'ils diffèrent, le document est reconstruit à partir de `content` (T0a, critères 7 et 8).
 * Si `content` est absent ou abîmé, le fichier est refusé avec `corrupted`.
 * Un fichier version 1 est d'abord migré en version 2 (T1.9, critère 7). Les images utilisées par le
 * document sont ensuite rangées dans le Y.Doc ; une image absente ou abîmée est simplement
 * manquante, le reste du document s'ouvre (critère 9).
 *
 * INVARIANT : crée toujours un nouveau Y.Doc. Appliquer un état sur un Y.Doc déjà rempli
 * additionnerait les deux contenus au lieu de les remplacer (voir CLAUDE.md).
 */
export function parseDocument(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid-json" };
  }

  if (!isRecord(data) || data.format !== NANO_FORMAT || !Number.isInteger(data.version)) {
    return { ok: false, error: "not-nano" };
  }
  const file = migrateToCurrent(data, NANO_FORMAT_VERSION);
  if (!file) {
    return { ok: false, error: "unsupported-version" };
  }
  if (typeof file.id !== "string" || file.id.trim() === "") {
    return { ok: false, error: "not-nano" };
  }

  const id = file.id;
  const version = NANO_FORMAT_VERSION;
  const fromYdoc = readYdoc(file.ydoc);
  const content = readContent(file.content);

  // INVARIANT : un `content` abîmé ou absent renvoie toujours `corrupted`, même si le `ydoc` se lit.
  // Sans `content`, rien ne prouve que le `ydoc` est complet, et l'ouvrir permettrait d'enregistrer
  // un document incomplet par-dessus le fichier d'origine (décision du product owner, revue de T0a).
  if (!content) {
    return { ok: false, error: "corrupted" };
  }
  const ydoc =
    fromYdoc && isSameJson(contentOf(fromYdoc), content)
      ? fromYdoc
      : prosemirrorJSONToYDoc(documentSchema, content, YJS_FRAGMENT_NAME);
  addFileImages(ydoc, content, file.images);
  return { ok: true, id, ydoc, version };
}

/**
 * Range dans le Y.Doc neuf les images de `images` utilisées par `content`. Une entrée absente, d'un
 * format inconnu, au base64 illisible ou dont le contenu ne correspond pas à son empreinte est ignorée :
 * l'image s'affiche « Image manquante » (critère 9).
 */
function addFileImages(ydoc: Y.Doc, content: DocumentJson, images: unknown): void {
  if (!isRecord(images)) return;
  ydoc.transact(() => {
    for (const hash of imageRefs(content)) {
      const entry = images[hash];
      if (!isImageHash(hash) || !isRecord(entry) || !isImageType(entry.type)) continue;
      if (typeof entry.data !== "string") continue;
      let data: Uint8Array;
      try {
        data = base64ToBytes(entry.data);
      } catch {
        continue; // Base64 abîmé : l'image reste manquante.
      }
      // Contenu qui ne correspond pas à son empreinte ou à son format (fichier modifié à la main) :
      // manquant plutôt que faux, pour qu'une réinsertion de la vraie image le remplace (critère 9).
      if (detectImageType(data) !== entry.type || imageHash(data) !== hash) continue;
      putImage(ydoc, hash, { type: entry.type, data });
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Applique l'état Yjs encodé en base64 sur un nouveau Y.Doc, ou renvoie null s'il est illisible. */
function readYdoc(encoded: unknown): Y.Doc | null {
  if (typeof encoded !== "string") return null;
  try {
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, base64ToBytes(encoded));
    return ydoc;
  } catch {
    return null;
  }
}

/** Vérifie que `content` est un document conforme au schéma partagé, ou renvoie null. */
function readContent(content: unknown): DocumentJson | null {
  if (!isRecord(content)) return null;
  try {
    const node = documentSchema.nodeFromJSON(content);
    if (node.type !== documentSchema.topNodeType) return null;
    // Un document vide (aucun paragraphe) est enregistré tel quel par un Y.Doc neuf : on l'accepte,
    // même si le schéma demande au moins un bloc. Sinon, on vérifie toute la structure.
    if (node.childCount > 0) node.check();
    return content as unknown as DocumentJson;
  } catch {
    return null;
  }
}

/** Compare deux valeurs JSON en profondeur, sans dépendre de l'ordre des clés des objets. */
function isSameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => isSameJson(item, b[index]))
    );
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  const keysA = Object.keys(a).filter((key) => a[key] !== undefined);
  const keysB = Object.keys(b).filter((key) => b[key] !== undefined);
  return keysA.length === keysB.length && keysA.every((key) => isSameJson(a[key], b[key]));
}
