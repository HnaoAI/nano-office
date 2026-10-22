// Comparaison au mot de deux textes (T3.1, critère 7) et compte des mots d'une sélection (critère 15).
// Logique pure : découpage par `Intl.Segmenter` (mots, espaces, ponctuation, emojis), puis plus longue
// sous-suite commune des morceaux. Aucune bibliothèque : le calcul tient en quelques lignes.

/** Une modification d'un texte : remplacer `[from, to)` par `insert` (positions en unités UTF-16). */
export interface TextChange {
  from: number;
  to: number;
  /** Texte retiré, égal à `original.slice(from, to)`. */
  removed: string;
  /** Texte ajouté à la place ; vide pour un simple retrait. */
  insert: string;
}

/** Nombre de mots au-delà duquel une sélection est refusée, pour éviter une facture surprise (critère 15). */
export const MAX_ASSISTANT_WORDS = 5000;

/**
 * Au-delà de ce nombre de cases, la partie centrale qui diffère est proposée d'un bloc, sans
 * comparaison fine : un paragraphe réécrit en entier ne bloque pas la page.
 */
const MAX_DIFF_CELLS = 4_000_000;

const segmenter = new Intl.Segmenter("fr", { granularity: "word" });

/**
 * Morceaux d'un texte : chaque mot, chaque suite d'espaces, chaque signe de ponctuation et chaque
 * emoji est un morceau. Les accents restent dans leur mot (« été » est un seul morceau).
 */
export function wordTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const { segment } of segmenter.segment(text)) {
    // Le découpage du navigateur garde ensemble les espaces qui se suivent : rien à fusionner.
    tokens.push(segment);
  }
  return tokens;
}

/** Nombre de mots d'un texte (nombres compris, ponctuation et emojis exclus). */
export function countWords(text: string): number {
  let count = 0;
  for (const { isWordLike } of segmenter.segment(text)) if (isWordLike) count += 1;
  return count;
}

/** Opération sur un morceau : gardé, retiré de l'original, ou ajouté par la correction. */
type Step = "same" | "removed" | "added";

/** Plus longue sous-suite commune de deux listes de morceaux, rendue comme une suite d'opérations. */
function lcsSteps(a: string[], b: string[]): Step[] {
  const n = a.length;
  const m = b.length;
  if (n * m > MAX_DIFF_CELLS) {
    return [...a.map((): Step => "removed"), ...b.map((): Step => "added")];
  }
  // lengths[i * (m + 1) + j] : longueur de la sous-suite commune de a[i..] et b[j..].
  const lengths = new Uint32Array((n + 1) * (m + 1));
  const length = (i: number, j: number) => lengths[i * (m + 1) + j] ?? 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lengths[i * (m + 1) + j] =
        a[i] === b[j] ? length(i + 1, j + 1) + 1 : Math.max(length(i + 1, j), length(i, j + 1));
    }
  }
  const steps: Step[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      steps.push("same");
      i += 1;
      j += 1;
    } else if (length(i + 1, j) >= length(i, j + 1)) {
      steps.push("removed");
      i += 1;
    } else {
      steps.push("added");
      j += 1;
    }
  }
  while (i < n) {
    steps.push("removed");
    i += 1;
  }
  while (j < m) {
    steps.push("added");
    j += 1;
  }
  return steps;
}

/**
 * Modifications qui transforment `original` en `corrected`, au mot (critère 7) : une faute corrigée
 * dans une phrase ne donne qu'une modification, sur ce mot. Les morceaux retirés et ajoutés qui se
 * suivent forment une seule modification (« chat » remplacé par « chats »).
 * @returns les modifications dans l'ordre du texte, sans chevauchement ; vide si les textes sont égaux
 */
export function diffWords(original: string, corrected: string): TextChange[] {
  if (original === corrected) return [];
  const a = wordTokens(original);
  const b = wordTokens(corrected);
  // Début et fin communs écartés avant le calcul, qui ne porte alors que sur la partie modifiée.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const steps = lcsSteps(a.slice(start, endA), b.slice(start, endB));

  const changes: TextChange[] = [];
  let position = a.slice(0, start).join("").length;
  let ia = start;
  let ib = start;
  let current: TextChange | null = null;
  for (const step of steps) {
    if (step === "same") {
      if (current) changes.push(current);
      current = null;
      position += (a[ia] ?? "").length;
      ia += 1;
      ib += 1;
      continue;
    }
    current ??= { from: position, to: position, removed: "", insert: "" };
    if (step === "removed") {
      const token = a[ia] ?? "";
      current.to += token.length;
      current.removed += token;
      position += token.length;
      ia += 1;
    } else {
      current.insert += b[ib] ?? "";
      ib += 1;
    }
  }
  if (current) changes.push(current);
  return changes;
}
