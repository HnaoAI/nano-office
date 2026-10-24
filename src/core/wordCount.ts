// Compteur de mots (T2.11) : mots, caractères avec et sans espaces, paragraphes, comptés comme dans Word, et
// textes du pied de page (« 1 234 mots », « 45 mots sur 1 234 »). Logique pure, sans navigateur ni React :
// le texte vient des blocs du document (ProseMirror), compté bloc par bloc et gardé tant qu'un bloc ne change pas.
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/** Statistiques d'un texte ou d'un document. */
export interface TextStats {
  words: number;
  /** Caractères, espaces compris ; un emoji ou une lettre accentuée compte pour un. */
  characters: number;
  /** Caractères sans les espaces. */
  charactersNoSpaces: number;
  /** Paragraphes non vides : paragraphes, titres, éléments de liste et cellules. */
  paragraphs: number;
}

/** Statistiques vides. */
export const EMPTY_STATS: TextStats = {
  words: 0,
  characters: 0,
  charactersNoSpaces: 0,
  paragraphs: 0,
};

const WHITESPACE = /\s+/u;
const graphemes = new Intl.Segmenter("fr", { granularity: "grapheme" });

/** Nombre de caractères tels qu'on les voit : « é » décomposé, 🇫🇷 ou 👍🏽 comptent pour un. */
function graphemeCount(text: string): number {
  return Array.from(graphemes.segment(text)).length;
}

/**
 * Statistiques d'un texte, comme dans Word (critère 2) : un mot est une suite de caractères entre deux espaces.
 * « l'école », « porte-clés » et « 2026 » comptent chacun pour un mot.
 */
export function textStats(text: string): TextStats {
  const words = text.split(WHITESPACE).filter((word) => word !== "").length;
  return {
    words,
    characters: graphemeCount(text),
    charactersNoSpaces: graphemeCount(text.replace(/\s/gu, "")),
    paragraphs: text.trim() === "" ? 0 : 1,
  };
}

/** Somme de deux statistiques. */
function add(a: TextStats, b: TextStats): TextStats {
  return {
    words: a.words + b.words,
    characters: a.characters + b.characters,
    charactersNoSpaces: a.charactersNoSpaces + b.charactersNoSpaces,
    paragraphs: a.paragraphs + b.paragraphs,
  };
}

/**
 * Statistiques déjà comptées, par nœud. Un nœud ProseMirror ne change jamais : un bloc modifié est un nouveau
 * nœud, et seul lui est recompté, ce qui garde la frappe fluide même sur 100 pages (critère 4).
 */
const cache = new WeakMap<ProseMirrorNode, TextStats>();

/**
 * Statistiques d'un nœud du document : la somme de ses blocs de texte, chacun compté à part (deux blocs ne
 * collent jamais leurs mots). Les images et les sauts de page n'ont pas de texte et ne comptent pas (critère 2).
 */
export function nodeStats(node: ProseMirrorNode): TextStats {
  const cached = cache.get(node);
  if (cached) return cached;
  let stats = EMPTY_STATS;
  if (node.isTextblock) {
    stats = textStats(node.textContent);
  } else {
    node.forEach((child) => {
      stats = add(stats, nodeStats(child));
    });
  }
  cache.set(node, stats);
  return stats;
}

/**
 * Statistiques du texte compris entre `from` et `to` (une sélection), bloc de texte par bloc de texte.
 * @param doc document
 * @param ranges plages sélectionnées, en positions de ProseMirror
 */
export function rangeStats(
  doc: ProseMirrorNode,
  ranges: readonly { from: number; to: number }[],
): TextStats {
  let stats = EMPTY_STATS;
  for (const { from, to } of ranges) {
    if (from === to) continue;
    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return true;
      const start = Math.max(from, pos + 1);
      const end = Math.min(to, pos + node.nodeSize - 1);
      if (end > start) stats = add(stats, textStats(doc.textBetween(start, end)));
      return false;
    });
  }
  return stats;
}

const NUMBER = new Intl.NumberFormat("fr-FR");

/** Nombre écrit à la française : 1 234, avec une espace fine insécable. */
export function frenchNumber(value: number): string {
  return NUMBER.format(value);
}

/** « 1 mot », « 0 mot », « 1 234 mots » : singulier jusqu'à 1, comme en français. */
export function wordsText(count: number): string {
  return `${frenchNumber(count)} ${count < 2 ? "mot" : "mots"}`;
}

/**
 * Texte du compteur du pied de page (critère 1) : « 1 234 mots », ou « 45 mots sur 1 234 » avec une sélection.
 * @param total mots du document
 * @param selected mots sélectionnés, ou null sans sélection
 */
export function wordCounterText(total: number, selected: number | null): string {
  if (selected === null) return wordsText(total);
  return `${wordsText(selected)} sur ${frenchNumber(total)}`;
}
