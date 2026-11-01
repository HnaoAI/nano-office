// Ouverture d'un fichier Word `.docx` (T2.18) : lecture de l'archive avec JSZip (utilisée sous licence MIT),
// reconnaissance des fichiers protégés, des anciens `.doc` et des `.odt`, puis conversion du XML de Word en
// nouveau document Nano Buro : blocs (wordImportBlocks.ts), listes et encadrés (wordImportGroups.ts), mise en
// page, en-tête et pied de page (wordImportPage.ts). Tout se fait sur l'ordinateur, rien ne passe par le réseau
// (critère 5). Le fichier Word n'est jamais modifié : il est seulement lu (critère 1).
// Logique pure : le XML est analysé par un `XmlParser` fourni par l'appelant, les images sont réduites par
// src/editor/imageImport.ts avant `wordDocument`.
import JSZip from "jszip";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import type * as Y from "yjs";
import { createDocumentId } from "./fileFormat";
import { headerFooterAttrs, headerFooterFromAttrs, writeHeaderFooter } from "./headerFooter";
import { imageHash, storeImage, type StoredImage } from "./images";
import { pageSetupAttrs, pageSetupFromAttrs, writePageSetup } from "./pageSetup";
import { documentSchema, YJS_FRAGMENT_NAME } from "./schema";
import type { DocumentJson, OpenDocument } from "./types";
import {
  blockItems,
  type BlockContext,
  type WordRelationship,
  type WordSkipped,
} from "./wordImportBlocks";
import { groupBlocks, withBlockIds } from "./wordImportGroups";
import { headerFooterOf, pageSetupOf, type SectionMargins } from "./wordImportPage";
import { readWordStyles } from "./wordImportStyles";
import {
  childElements,
  parseXml,
  rAttr,
  wAttr,
  wChild,
  wChildren,
  type XmlParser,
} from "./wordXml";

import { nanoNameOf } from "./wordFiles";

export type { WordSkipped } from "./wordImportBlocks";
export type { XmlParser } from "./wordXml";

/**
 * Raison d'un refus (critère 4) :
 * - `protected` : fichier Word protégé par un mot de passe (chiffré) ;
 * - `old-word` : ancien format de Word (`.doc`, 97-2003) ;
 * - `opendocument` : document OpenDocument (`.odt`, LibreOffice) ;
 * - `damaged` : archive ou XML abîmé, ou fichier qui n'est pas un document Word.
 */
export type WordOpenError = "protected" | "old-word" | "opendocument" | "damaged";

/** Fichier Word converti, avant la préparation de ses images. */
export interface WordConversion {
  /** Document au format JSON de Tiptap ; chaque image porte une clé provisoire dans `hash`. */
  content: DocumentJson;
  /** Contenu de chaque image, par clé provisoire, à préparer (réduire) avant `wordDocument`. */
  images: Map<string, Uint8Array>;
  skipped: Set<WordSkipped>;
  /** Vrai si le fichier avait un suivi des modifications, lu avec toutes les modifications acceptées (critère 3). */
  trackedChanges: boolean;
}

/** Résultat de `readWordFile` : jamais d'exception. */
export type WordReadResult =
  { ok: true; conversion: WordConversion } | { ok: false; error: WordOpenError };

/** Messages des refus (critère 4), repris par l'aide (A1). */
export const WORD_ERROR_MESSAGES: Record<WordOpenError, string> = {
  protected:
    "Ce fichier Word est protégé par un mot de passe : Nano Buro ne peut pas l'ouvrir. Retirez le mot de passe dans Word, puis ouvrez-le de nouveau. Il n'a pas été modifié.",
  "old-word":
    "Ce fichier est dans l'ancien format de Word (.doc), que Nano Buro ne sait pas ouvrir. Dans Word, enregistrez-le au format .docx, puis ouvrez-le de nouveau. Il n'a pas été modifié.",
  opendocument:
    "Ce fichier est un document OpenDocument (.odt), que Nano Buro ne sait pas ouvrir. Enregistrez-le au format Word (.docx), puis ouvrez-le de nouveau. Il n'a pas été modifié.",
  damaged: "Ce fichier Word est abîmé et ne peut pas être ouvert. Il n'a pas été modifié.",
};

/** Ce qui n'a pas été repris, dans l'ordre du message (critère 3). */
const SKIPPED_LABELS: Record<WordSkipped, string> = {
  comments: "les commentaires",
  footnotes: "les notes de bas de page et de fin",
  textBoxes: "les zones de texte",
  shapes: "les formes, graphiques et objets",
  equations: "les équations",
  unsupportedImages: "les images d'un format non pris en charge (EMF, WMF, TIFF…)",
  headerFooter: "les en-têtes et pieds de page complexes (seul leur texte principal est repris)",
  fields: "les champs (dates, renvois…), remplacés par leur texte",
  mergedCells: "les cellules fusionnées des tableaux, séparées",
  nestedTables: "les tableaux dans un tableau, mis à plat",
  tableImages: "les images des tableaux, placées après le tableau",
};

/** Premiers octets d'un fichier OLE (ancien `.doc`, ou `.docx` chiffré par un mot de passe). */
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** « EncryptedPackage » en UTF-16 : flux d'un `.docx` chiffré, rangé dans un fichier OLE. */
const ENCRYPTED_PACKAGE = Array.from("EncryptedPackage", (char) => [char.charCodeAt(0), 0]).flat();

/** Taille au-delà de laquelle un fichier n'est pas lu (une archive de Word de 50 pages avec photos en fait 10 à 30). */
export const MAX_WORD_BYTES = 200 * 1024 * 1024;

/** Vrai si les octets commencent par `signature` (à partir de `offset`). */
function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/** Vrai si `pattern` apparaît dans les octets. */
function contains(bytes: Uint8Array, pattern: readonly number[]): boolean {
  const first = pattern[0];
  for (
    let index = bytes.indexOf(first ?? 0);
    index !== -1;
    index = bytes.indexOf(first ?? 0, index + 1)
  ) {
    if (startsWith(bytes, pattern, index)) return true;
  }
  return false;
}

/** Vrai si les octets ressemblent à un fichier Word ou OpenDocument (archive ZIP ou fichier OLE). */
export function looksLikeWordFile(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, OLE_SIGNATURE);
}

/** Chemin d'une cible de relation, à partir du dossier de la partie qui la cite. */
function resolvePath(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = [...base.split("/").filter(Boolean), ...target.split("/")];
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "..") resolved.pop();
    else if (part !== "." && part !== "") resolved.push(part);
  }
  return resolved.join("/");
}

/** Relations d'une partie de l'archive (`word/_rels/document.xml.rels`), cibles résolues dans l'archive. */
async function readRelationships(
  zip: JSZip,
  partPath: string,
  parser: XmlParser,
): Promise<Map<string, WordRelationship>> {
  const folder = partPath.includes("/") ? partPath.slice(0, partPath.lastIndexOf("/")) : "";
  const name = partPath.slice(partPath.lastIndexOf("/") + 1);
  const rels = new Map<string, WordRelationship>();
  const text = await zip.file(`${folder ? `${folder}/` : ""}_rels/${name}.rels`)?.async("string");
  if (!text) return rels;
  for (const rel of Array.from(parseXml(parser, text).children)) {
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (!id || !target) continue;
    const external = rel.getAttribute("TargetMode") === "External";
    rels.set(id, {
      type: rel.getAttribute("Type") ?? "",
      target: external ? target : resolvePath(folder, target),
      external,
    });
  }
  return rels;
}

/** Partie XML de l'archive analysée, ou null si elle manque. */
async function readPart(
  zip: JSZip,
  path: string | undefined,
  parser: XmlParser,
): Promise<Element | null> {
  const text = path ? await zip.file(path)?.async("string") : undefined;
  return text === undefined ? null : parseXml(parser, text);
}

/** Cible de la première relation dont le type finit par `/<kind>`. */
function targetOf(rels: ReadonlyMap<string, WordRelationship>, kind: string): string | undefined {
  for (const rel of rels.values())
    if (!rel.external && rel.type.endsWith(`/${kind}`)) return rel.target;
  return undefined;
}

/** En-têtes et pieds de page d'une section, lus dans l'archive. */
async function readSectionMargins(
  zip: JSZip,
  sectPr: Element | null,
  rels: ReadonlyMap<string, WordRelationship>,
  parser: XmlParser,
): Promise<SectionMargins> {
  const part = async (tag: string, type: string) => {
    const reference = (sectPr ? wChildren(sectPr, tag) : []).find(
      (element) => (wAttr(element, "type") ?? "default") === type,
    );
    const id = rAttr(reference, "id");
    return readPart(zip, id ? rels.get(id)?.target : undefined, parser);
  };
  const titlePage = wChild(sectPr, "titlePg");
  return {
    header: await part("headerReference", "default"),
    footer: await part("footerReference", "default"),
    first:
      titlePage && wAttr(titlePage, "val") !== "0" && wAttr(titlePage, "val") !== "false"
        ? {
            header: await part("headerReference", "first"),
            footer: await part("footerReference", "first"),
          }
        : null,
    evenAndOdd:
      sectPr !== null &&
      [...wChildren(sectPr, "headerReference"), ...wChildren(sectPr, "footerReference")].some(
        (element) => wAttr(element, "type") === "even",
      ),
  };
}

/** Section du document : celle de la fin du corps, ou celle du dernier paragraphe qui en ferme une. */
function lastSection(body: Element): Element | null {
  const direct = wChild(body, "sectPr");
  if (direct) return direct;
  const sections = Array.from(body.getElementsByTagNameNS("*", "sectPr"));
  return sections[sections.length - 1] ?? null;
}

/**
 * Lit un fichier Word et le convertit (critères 1 à 4). Ne lève jamais d'exception.
 * @param bytes contenu du fichier choisi, lu sans être modifié
 * @param parser analyseur XML (`DOMParser` du navigateur)
 */
export async function readWordFile(bytes: Uint8Array, parser: XmlParser): Promise<WordReadResult> {
  if (startsWith(bytes, OLE_SIGNATURE)) {
    return { ok: false, error: contains(bytes, ENCRYPTED_PACKAGE) ? "protected" : "old-word" };
  }
  if (bytes.length > MAX_WORD_BYTES || !startsWith(bytes, [0x50, 0x4b])) {
    return { ok: false, error: "damaged" };
  }
  try {
    const zip = await JSZip.loadAsync(bytes);
    const mimetype = await zip.file("mimetype")?.async("string");
    if (mimetype?.startsWith("application/vnd.oasis.opendocument"))
      return { ok: false, error: "opendocument" };
    const packageRels = await readRelationships(zip, "", parser);
    const documentPath = targetOf(packageRels, "officeDocument") ?? "word/document.xml";
    const root = await readPart(zip, documentPath, parser);
    const body = wChild(root, "body");
    if (!body) return { ok: false, error: "damaged" };
    const rels = await readRelationships(zip, documentPath, parser);
    const styles = readWordStyles(
      await readPart(zip, targetOf(rels, "styles"), parser),
      await readPart(zip, targetOf(rels, "theme"), parser),
      await readPart(zip, targetOf(rels, "numbering"), parser),
    );
    const media = new Map<string, Uint8Array>();
    for (const [id, rel] of rels) {
      if (rel.external || !rel.type.endsWith("/image")) continue;
      const data = await zip.file(rel.target)?.async("uint8array");
      if (data) media.set(id, data);
    }
    const context: BlockContext = {
      styles,
      rels,
      media,
      images: new Map(),
      skipped: new Set(),
      trackedChanges: false,
      fields: [],
      listCounts: new Map(),
      imageKeys: new Map(),
    };
    const blocks = groupBlocks(blockItems(childElements(body), context, false), context);
    const sectPr = lastSection(body);
    const margins = headerFooterOf(await readSectionMargins(zip, sectPr, rels, parser));
    if (margins.complex) context.skipped.add("headerFooter");
    const content = withBlockIds({
      type: "doc",
      attrs: { ...pageSetupAttrs(pageSetupOf(sectPr)), ...headerFooterAttrs(margins.settings) },
      content: blocks.length > 0 ? blocks : [{ type: "paragraph" }],
    });
    // Le document doit respecter le schéma : sinon, il ne pourrait pas être affiché ni enregistré.
    documentSchema.nodeFromJSON(content).check();
    return {
      ok: true,
      conversion: {
        content,
        images: context.images,
        skipped: context.skipped,
        trackedChanges: context.trackedChanges,
      },
    };
  } catch {
    return { ok: false, error: "damaged" };
  }
}

/**
 * Remplace la clé provisoire de chaque image par l'empreinte de l'image préparée ; une image refusée est retirée.
 * Un encadré vidé de ses images disparaît, et un document vide garde un paragraphe.
 */
function withPreparedImages(
  node: DocumentJson,
  prepared: ReadonlyMap<string, StoredImage | null>,
  missing: { count: number },
): DocumentJson | null {
  if (node.type === "image") {
    const image = prepared.get(String(node.attrs?.hash));
    if (!image) {
      missing.count++;
      return null;
    }
    return { ...node, attrs: { ...node.attrs, hash: imageHash(image.data) } };
  }
  if (!node.content) return node;
  const content = node.content.flatMap(
    (child) => withPreparedImages(child, prepared, missing) ?? [],
  );
  if (content.length === 0 && node.type === "callout") return null;
  if (content.length === 0 && node.type === "doc") content.push({ type: "paragraph" });
  return { ...node, content };
}

/**
 * Nouveau document Nano Buro d'un fichier Word converti (critères 1 et 6) : nouvel `id`, nouveau Y.Doc, aucun
 * fichier courant, et le nom du fichier Word avec `.nano` proposé par « Enregistrer ».
 * INVARIANT : le Y.Doc est toujours neuf (voir CLAUDE.md) ; le fichier Word ne devient jamais le fichier courant.
 * @param prepared chaque image préparée (réduite comme au lot D), par clé provisoire, ou null si elle est refusée
 * @param wordName nom du fichier Word
 * @returns le document, et ce qui n'a pas pu être repris (images refusées comprises)
 */
export function wordDocument(
  conversion: WordConversion,
  prepared: ReadonlyMap<string, StoredImage | null>,
  wordName: string,
): { document: OpenDocument; skipped: Set<WordSkipped> } {
  const missing = { count: 0 };
  const content = withPreparedImages(conversion.content, prepared, missing) ?? { type: "doc" };
  const ydoc: Y.Doc = prosemirrorJSONToYDoc(documentSchema, content, YJS_FRAGMENT_NAME);
  writePageSetup(ydoc, pageSetupFromAttrs(content.attrs));
  writeHeaderFooter(ydoc, headerFooterFromAttrs(content.attrs));
  ydoc.transact(() => {
    for (const image of prepared.values()) if (image) storeImage(ydoc, image);
  });
  return {
    document: {
      id: createDocumentId(),
      ydoc,
      fileName: null,
      savedSnapshot: null,
      suggestedName: nanoNameOf(wordName),
    },
    skipped:
      missing.count > 0
        ? new Set([...conversion.skipped, "unsupportedImages"])
        : conversion.skipped,
  };
}

/**
 * Message affiché après l'ouverture d'un fichier Word (critères 1 et 3) : le fichier Word n'est pas modifié, ce qui
 * n'a pas pu être repris, et le suivi des modifications lu avec les modifications acceptées.
 */
export function wordOpenNotice(
  wordName: string,
  skipped: ReadonlySet<WordSkipped>,
  trackedChanges: boolean,
): string {
  const parts = [
    `« ${wordName} » a été ouvert comme un nouveau document Nano Buro ; le fichier Word n'est pas modifié.`,
  ];
  const labels = (Object.keys(SKIPPED_LABELS) as WordSkipped[])
    .filter((key) => skipped.has(key))
    .map((key) => SKIPPED_LABELS[key]);
  if (labels.length > 0)
    parts.push(`Certains éléments n'ont pas pu être repris : ${labels.join(", ")}.`);
  if (trackedChanges) {
    parts.push("Le suivi des modifications a été lu avec toutes les modifications acceptées.");
  }
  return parts.join(" ");
}
