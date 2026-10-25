// Sommaire automatique (T2.17) : lignes du sommaire (les Titre 1 à 3 du document), texte d'une ligne,
// ancre d'un titre pour les liens du PDF et signet de Word. Logique pure, sur le document ProseMirror
// ou son JSON ; l'affichage est dans src/editor/toc.ts, l'export Word dans wordToc.ts.
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { documentOutline } from "./outline";
import { BLOCK_ID_ATTRIBUTE } from "./schema";
import { TOC_NODE } from "./tocSchema";
import type { DocumentJson } from "./types";

/**
 * Une ligne du sommaire : un titre de premier niveau du document (comme le plan, T2.9), avec son
 * identifiant de bloc (null avant que l'éditeur l'ait attribué) et sa place parmi les blocs.
 */
export interface TocEntry {
  id: string | null;
  index: number;
  level: number;
  text: string;
}

/** Texte d'une ligne pour un titre sans texte, pour qu'elle reste visible et cliquable. */
export const EMPTY_TOC_HEADING = "Titre sans texte";

/**
 * Lignes du sommaire, dans l'ordre du document (critère 2). Comme le plan (T2.9), seuls les titres
 * placés directement dans le document comptent, pas ceux d'un tableau ou d'un encadré.
 */
export function tocEntries(doc: ProseMirrorNode): TocEntry[] {
  return documentOutline(doc).flatMap((entry) =>
    entry.kind === "heading"
      ? [{ id: entry.id, index: entry.index, level: entry.level, text: entry.text }]
      : [],
  );
}

/** Lignes du sommaire d'un document au format JSON de Tiptap (export Word). */
export function tocEntriesFromJson(content: DocumentJson): TocEntry[] {
  const entries: TocEntry[] = [];
  (content.content ?? []).forEach((block, index) => {
    if (block.type !== "heading") return;
    const id: unknown = block.attrs?.[BLOCK_ID_ATTRIBUTE];
    entries.push({
      id: typeof id === "string" && id !== "" ? id : null,
      index,
      level: Number(block.attrs?.level) || 1,
      text: jsonText(block),
    });
  });
  return entries;
}

function jsonText(node: DocumentJson): string {
  return node.text ?? (node.content ?? []).map(jsonText).join("");
}

/** Vrai si le document contient au moins un sommaire (directement dans le document). */
export function hasToc(doc: ProseMirrorNode): boolean {
  let found = false;
  doc.forEach((node) => {
    if (node.type.name === TOC_NODE) found = true;
  });
  return found;
}

/** Vrai si le document JSON contient au moins un sommaire. */
export function jsonHasToc(content: DocumentJson): boolean {
  return (content.content ?? []).some((block) => block.type === TOC_NODE);
}

/** Texte affiché d'une ligne : le texte du titre, ou « Titre sans texte ». */
export function tocLineText(entry: Pick<TocEntry, "text">): string {
  return entry.text.trim() === "" ? EMPTY_TOC_HEADING : entry.text;
}

/**
 * Identifiant HTML d'un titre, cible du lien d'une ligne du sommaire dans le PDF (critère 5). Seuls les
 * lettres, chiffres, tirets et soulignés de l'identifiant de bloc sont gardés.
 */
export function tocAnchor(blockId: string): string {
  return `titre-${blockId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

/**
 * Nom du signet de Word d'un titre, cible d'une ligne du sommaire exporté : `_Toc` puis 36 lettres ou
 * chiffres au plus, car Word refuse les signets de plus de 40 caractères.
 */
export function wordBookmark(blockId: string): string {
  return `_Toc${blockId.replace(/[^A-Za-z0-9]/g, "").slice(0, 36)}`;
}
