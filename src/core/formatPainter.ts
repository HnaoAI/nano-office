// Pinceau « Reproduire la mise en forme » (PL4) : mise en forme copiée au curseur et appliquée à une cible, sur le
// modèle ProseMirror, sans navigateur. L'éditeur (src/editor/formatPainter.ts) s'occupe de la souris et de l'état.
import type { Mark, Node as PmNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { INDENT_TYPES, indentLevel } from "./indent";
import { LINE_HEIGHT_TYPES } from "./lineHeight";

/**
 * Marques copiées par le pinceau (critère 3) : gras, italique, souligné, barré, exposant, indice, police, taille et
 * couleur (marque `textStyle`), surlignage. Le lien n'en fait pas partie : il reste sur la cible.
 */
export const PAINTED_MARKS = [
  "bold",
  "italic",
  "underline",
  "strike",
  "superscript",
  "subscript",
  "textStyle",
  "highlight",
] as const;

/** Blocs dont le pinceau change l'alignement, l'interligne et le retrait : paragraphes et titres (critère 3). */
const PAINTED_BLOCKS = new Set([...LINE_HEIGHT_TYPES, ...INDENT_TYPES]);

/** Mise en forme du paragraphe copiée : alignement, interligne, retrait ; null vaut la valeur par défaut. */
export interface PaintedBlock {
  textAlign: string | null;
  lineHeight: string | null;
  indent: number | null;
}

/** Mise en forme copiée au clic sur le pinceau (critère 2). */
export interface CopiedFormat {
  /** Marques du texte, parmi `PAINTED_MARKS` ; une liste vide vaut un texte sans mise en forme. */
  marks: readonly Mark[];
  block: PaintedBlock;
}

/** Plage du document qui reçoit la mise en forme. */
export interface PaintRange {
  from: number;
  to: number;
}

function isPainted(mark: Mark): boolean {
  return (PAINTED_MARKS as readonly string[]).includes(mark.type.name);
}

function blockFormat(block: PmNode, inListItem: boolean): PaintedBlock {
  const textAlign: unknown = block.attrs.textAlign;
  const lineHeight: unknown = block.attrs.lineHeight;
  const level = inListItem ? 0 : indentLevel(block.attrs.indent);
  return {
    textAlign: typeof textAlign === "string" && textAlign !== "left" ? textAlign : null,
    lineHeight: typeof lineHeight === "string" ? lineHeight : null,
    indent: level === 0 ? null : level,
  };
}

/**
 * Mise en forme au curseur, ou au début de la sélection (critère 2) : marques du premier caractère sélectionné, ou
 * celles que la frappe recevrait au curseur, et attributs de son paragraphe. Le niveau de titre, la liste et
 * l'encadré ne sont pas copiés : ce sont des blocs, pas des attributs.
 * @returns null si la sélection ne contient aucun texte (image, schéma, saut de page, sommaire choisi d'un clic)
 */
export function captureFormat(state: EditorState): CopiedFormat | null {
  const { selection, doc } = state;
  let source: { marks: readonly Mark[]; block: PmNode; pos: number } | null = null;
  if (selection.empty) {
    const { $from } = selection;
    if ($from.parent.isTextblock) {
      source = {
        marks: state.storedMarks ?? $from.marks(),
        block: $from.parent,
        pos: $from.before(),
      };
    }
  } else {
    doc.nodesBetween(selection.from, selection.to, (node, pos, parent) => {
      if (source) return false;
      if (node.isText && parent) {
        source = { marks: node.marks, block: parent, pos: doc.resolve(pos).before() };
        return false;
      }
      return true;
    });
    if (!source && selection.$from.parent.isTextblock) {
      source = { marks: [], block: selection.$from.parent, pos: selection.$from.before() };
    }
  }
  if (!source) return null;
  const found: { marks: readonly Mark[]; block: PmNode; pos: number } = source;
  const inListItem = doc.resolve(found.pos).parent.type.name === "listItem";
  return { marks: found.marks.filter(isPainted), block: blockFormat(found.block, inListItem) };
}

/**
 * Applique la mise en forme copiée aux plages, dans une seule transaction (critère 7). Elle **remplace** celle de la
 * cible, comme Word (critère 4) : les marques de `PAINTED_MARKS` absentes de la source sont retirées, le lien reste.
 * Chaque paragraphe ou titre touché reçoit l'alignement, l'interligne et, hors d'une liste, le retrait ; un titre
 * garde son niveau. Les images, schémas, sauts de page et sommaires ne changent pas (critère 8).
 * Une plage vide (curseur hors d'un mot) ne change que son paragraphe, et la frappe suivante prend les marques.
 * @returns la transaction, ou null si aucune plage ne touche de texte
 */
export function applyFormat(
  state: EditorState,
  ranges: readonly PaintRange[],
  format: CopiedFormat,
): Transaction | null {
  const tr = state.tr;
  const { doc, schema } = state;
  const removed = PAINTED_MARKS.map((name) => schema.marks[name]).filter(
    (type) => type !== undefined,
  );
  const blocks = new Map<number, { node: PmNode; inListItem: boolean }>();
  let touched = false;
  let storeMarks = false;

  for (const range of ranges) {
    if (range.from === range.to) {
      const $pos = doc.resolve(range.from);
      if (!$pos.parent.isTextblock) continue;
      const pos = $pos.before();
      blocks.set(pos, {
        node: $pos.parent,
        inListItem: doc.resolve(pos).parent.type.name === "listItem",
      });
      storeMarks = true;
      touched = true;
      continue;
    }
    doc.nodesBetween(range.from, range.to, (node, pos, parent) => {
      if (!node.isTextblock) return true;
      blocks.set(pos, { node, inListItem: parent?.type.name === "listItem" });
      const from = Math.max(range.from, pos + 1);
      const to = Math.min(range.to, pos + node.nodeSize - 1);
      if (from < to) {
        for (const type of removed) tr.removeMark(from, to, type);
        for (const mark of format.marks) {
          if (node.type.allowsMarkType(mark.type)) tr.addMark(from, to, mark);
        }
      }
      touched = true;
      return false;
    });
  }

  for (const [pos, { node, inListItem }] of blocks) {
    if (!PAINTED_BLOCKS.has(node.type.name)) continue;
    const attrs: Record<string, unknown> = { ...node.attrs };
    if ("textAlign" in attrs) attrs.textAlign = format.block.textAlign;
    if ("lineHeight" in attrs) attrs.lineHeight = format.block.lineHeight;
    if ("indent" in attrs && !inListItem) attrs.indent = format.block.indent;
    tr.setNodeMarkup(pos, undefined, attrs);
  }
  // Après les étapes, qui effacent les marques en attente de la transaction.
  if (storeMarks) tr.setStoredMarks(format.marks);
  return touched ? tr : null;
}

/** Caractère d'un mot : lettre, chiffre, accent combiné, apostrophe droite ou typographique. */
const WORD_CHARACTER = /[\p{L}\p{N}\p{M}'’_]/u;

/**
 * Mot qui contient la position, ou qu'elle touche par un bord, pour un simple clic (critère 5). Le trait d'union
 * coupe le mot, comme le double clic de Word.
 * @returns la plage du mot, ou null hors d'un mot (espace, emoji, ponctuation, bloc sans texte)
 */
export function wordRangeAt(doc: PmNode, pos: number): PaintRange | null {
  const $pos = doc.resolve(pos);
  const block = $pos.parent;
  if (!block.isTextblock) return null;
  // Un caractère par nœud non textuel, pour que les indices restent ceux des positions.
  const text = block.textBetween(0, block.content.size, undefined, "￼");
  const isWord = (index: number) => WORD_CHARACTER.test(text.charAt(index));
  let start = $pos.parentOffset;
  let end = start;
  while (start > 0 && isWord(start - 1)) start--;
  while (end < text.length && isWord(end)) end++;
  if (start === end) return null;
  const base = $pos.start();
  return { from: base + start, to: base + end };
}
