// Plan du document (T2.9) : titres et sauts de page de premier niveau, parties (un titre et ce qui le suit
// jusqu'au titre suivant de même niveau ou de niveau supérieur, comme le volet de navigation de Word), et
// déplacement d'une partie entière. Logique pure sur le document ProseMirror ; l'éditeur l'applique dans
// src/editor/outline.ts.
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { PAGE_BREAK_NODE } from "./pageBreakSchema";
import { BLOCK_ID_ATTRIBUTE } from "./schema";

/**
 * Une ligne du plan : un titre (niveau 1 à 3) ou un saut de page manuel.
 * `id` est l'identifiant de bloc (règle produit 5), null seulement avant que l'éditeur l'ait attribué ;
 * `index` est la place du bloc parmi les blocs de premier niveau.
 */
export type OutlineEntry =
  | { kind: "heading"; id: string | null; index: number; level: number; text: string }
  | { kind: "pageBreak"; id: string | null; index: number };

/** Une partie : de son titre (`from`) à la fin de son dernier bloc (`to`), positions du document. */
export interface SectionRange {
  from: number;
  to: number;
  level: number;
}

function blockId(node: ProseMirrorNode): string | null {
  const id: unknown = node.attrs[BLOCK_ID_ATTRIBUTE];
  return typeof id === "string" && id !== "" ? id : null;
}

function isHeading(node: ProseMirrorNode | null | undefined): node is ProseMirrorNode {
  return node?.type.name === "heading";
}

/**
 * Lignes du plan, dans l'ordre du document.
 * Seuls les blocs de premier niveau comptent : un titre écrit dans une cellule de tableau ne crée pas de
 * partie, car on ne peut pas déplacer la suite du document hors du tableau (T2.9, choix à confirmer).
 */
export function documentOutline(doc: ProseMirrorNode): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  doc.forEach((node, _offset, index) => {
    if (isHeading(node)) {
      entries.push({
        kind: "heading",
        id: blockId(node),
        index,
        level: Number(node.attrs.level),
        text: node.textContent,
      });
    } else if (node.type.name === PAGE_BREAK_NODE) {
      entries.push({ kind: "pageBreak", id: blockId(node), index });
    }
  });
  return entries;
}

/** Vrai si les deux plans affichent les mêmes lignes : le panneau n'est alors pas redessiné (critère 7). */
export function sameOutline(a: readonly OutlineEntry[], b: readonly OutlineEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, i) => {
    const other = b[i];
    if (!other || other.kind !== entry.kind || other.id !== entry.id) return false;
    if (other.index !== entry.index) return false;
    if (entry.kind === "heading" && other.kind === "heading") {
      return entry.level === other.level && entry.text === other.text;
    }
    return true;
  });
}

/**
 * Position d'un bloc de premier niveau, retrouvé par son identifiant, ou par sa place si la ligne du plan
 * n'en a pas encore. Null si le bloc n'existe plus (document modifié entre-temps).
 */
export function topBlockPos(
  doc: ProseMirrorNode,
  entry: Pick<OutlineEntry, "id" | "index">,
): number | null {
  let found: number | null = null;
  doc.forEach((node, offset, index) => {
    if (found !== null) return;
    if (entry.id !== null ? blockId(node) === entry.id : index === entry.index) found = offset;
  });
  return found;
}

/**
 * Partie qui commence au titre placé en `pos` : jusqu'au titre suivant de même niveau ou de niveau
 * supérieur (plus petit chiffre), ou jusqu'à la fin du document. Elle contient les paragraphes, listes,
 * tableaux, images, sauts de page et sous-titres qui suivent (critère 4).
 * @returns null si `pos` n'est pas le début d'un titre de premier niveau
 */
export function sectionRange(doc: ProseMirrorNode, pos: number): SectionRange | null {
  const heading = doc.nodeAt(pos);
  if (!isHeading(heading) || doc.resolve(pos).depth !== 0) return null;
  const level = Number(heading.attrs.level);
  let to = doc.content.size;
  let started = false;
  doc.forEach((node, offset) => {
    if (to !== doc.content.size || offset < pos) return;
    if (!started) {
      started = true;
      return;
    }
    if (isHeading(node) && Number(node.attrs.level) <= level) to = offset;
  });
  return { from: pos, to, level };
}

/**
 * Clé d'une ligne du plan : son identifiant de bloc, ou sa place tant qu'elle n'en a pas.
 */
export function entryKey(entry: Pick<OutlineEntry, "id" | "index">): string {
  return entry.id ?? `#${String(entry.index)}`;
}

/**
 * Clé (`entryKey`) du titre de la partie où se trouve le curseur : le dernier titre de premier niveau
 * qui commence avant lui (critère 3). Null avant le premier titre.
 */
export function activeHeading(doc: ProseMirrorNode, cursor: number): string | null {
  let active: string | null = null;
  doc.forEach((node, offset, index) => {
    if (offset > cursor || !isHeading(node)) return;
    active = entryKey({ id: blockId(node), index });
  });
  return active;
}

/** Vrai si poser la partie en `target` la déplace vraiment : ni sur place, ni à l'intérieur d'elle-même. */
export function canMoveSection(range: SectionRange, target: number): boolean {
  return target < range.from || target > range.to;
}

/**
 * Déplace une partie en `target` (début d'un bloc de premier niveau, ou fin du document), dans la
 * transaction donnée. Les blocs sont retirés puis remis tels quels, avec leurs attributs : les
 * identifiants de blocs, les cellules et les images (référencées par leur empreinte) sont gardés,
 * rien n'est copié ni perdu (critère 6).
 * @returns position du titre déplacé dans le nouveau document, ou null si le déplacement n'a pas d'effet
 */
export function moveSection(tr: Transaction, range: SectionRange, target: number): number | null {
  if (!canMoveSection(range, target)) return null;
  const blocks = tr.doc.slice(range.from, range.to).content;
  tr.delete(range.from, range.to);
  const at = target > range.to ? target - (range.to - range.from) : target;
  tr.insert(at, blocks);
  return at;
}

/**
 * Où poser une partie déplacée au clavier (Alt+Shift+Flèche, critère 4) : avant la partie précédente ou
 * après la suivante, de même niveau et dans la même partie parente. Null s'il n'y en a pas (première ou
 * dernière partie de son niveau) : un sous-titre ne change jamais de partie parente au clavier.
 */
export function neighbourTarget(
  doc: ProseMirrorNode,
  range: SectionRange,
  direction: "up" | "down",
): number | null {
  if (direction === "down") {
    const next = doc.nodeAt(range.to);
    if (!isHeading(next) || Number(next.attrs.level) !== range.level) return null;
    return sectionRange(doc, range.to)?.to ?? null;
  }
  let previous: { pos: number; level: number } | null = null;
  doc.forEach((node, offset) => {
    if (offset >= range.from || !isHeading(node)) return;
    const level = Number(node.attrs.level);
    if (level <= range.level) previous = { pos: offset, level };
  });
  const found = previous as { pos: number; level: number } | null;
  return found && found.level === range.level ? found.pos : null;
}
