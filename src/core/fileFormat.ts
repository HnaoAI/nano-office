// Format de fichier `.nano` version 1 : sérialisation et lecture, sans accès au navigateur.
// Dépend de Yjs, de @tiptap/y-tiptap (conversions fragment Yjs <-> JSON) et du schéma partagé.
import * as Y from "yjs";
import { prosemirrorJSONToYDoc, yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { base64ToBytes, bytesToBase64 } from "./base64";
import { documentSchema, YJS_FRAGMENT_NAME } from "./schema";
import {
  NANO_FORMAT,
  NANO_FORMAT_VERSION,
  type DocumentJson,
  type NanoFileV1,
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
 * Sérialise un document au format `.nano` version 1 (texte JSON à écrire en UTF-8).
 * INVARIANT : `content` est calculé ici à partir du `ydoc`, jamais fourni par l'appelant,
 * pour que les deux ne puissent pas diverger (T0a, critère 5). `parseDocument` s'appuie dessus.
 * @param doc.id identifiant du document, conservé tel quel
 * @param doc.ydoc état du document, lu sans être modifié
 */
export function serializeDocument(doc: { id: string; ydoc: Y.Doc }): string {
  const file: NanoFileV1 = {
    format: NANO_FORMAT,
    version: NANO_FORMAT_VERSION,
    id: doc.id,
    content: contentOf(doc.ydoc),
    ydoc: bytesToBase64(Y.encodeStateAsUpdate(doc.ydoc)),
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
  // Une future version 2 ajoutera ici la migration testée des fichiers version 1 (voir CLAUDE.md).
  if (data.version !== NANO_FORMAT_VERSION) {
    return { ok: false, error: "unsupported-version" };
  }
  if (typeof data.id !== "string" || data.id.trim() === "") {
    return { ok: false, error: "not-nano" };
  }

  const id = data.id;
  const version = NANO_FORMAT_VERSION;
  const fromYdoc = readYdoc(data.ydoc);
  const content = readContent(data.content);

  // INVARIANT : un `content` abîmé ou absent renvoie toujours `corrupted`, même si le `ydoc` se lit.
  // Sans `content`, rien ne prouve que le `ydoc` est complet, et l'ouvrir permettrait d'enregistrer
  // un document incomplet par-dessus le fichier d'origine (décision du product owner, revue de T0a).
  if (!content) {
    return { ok: false, error: "corrupted" };
  }
  if (fromYdoc && isSameJson(contentOf(fromYdoc), content)) {
    return { ok: true, id, ydoc: fromYdoc, version };
  }
  return {
    ok: true,
    id,
    ydoc: prosemirrorJSONToYDoc(documentSchema, content, YJS_FRAGMENT_NAME),
    version,
  };
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
