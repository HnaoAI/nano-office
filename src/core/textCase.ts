// Majuscules et minuscules (T2.4) : conversion d'un texte selon les règles du français. Code pur,
// sans éditeur : src/editor/textCase.ts l'applique au document, morceau de texte par morceau de texte.

/** Les quatre conversions proposées (critère 1). */
export const CASE_MODES = [
  { mode: "upper", label: "MAJUSCULES" },
  { mode: "lower", label: "minuscules" },
  { mode: "sentence", label: "Première lettre de la phrase" },
  { mode: "title", label: "Première Lettre De Chaque Mot" },
] as const;

/** Conversion choisie. */
export type CaseMode = (typeof CASE_MODES)[number]["mode"];

/** Langue des règles de conversion : é donne É, ç donne Ç, œ donne Œ (critère 3). */
const LOCALE = "fr";

const LETTER = /\p{L}/u;
const MARK = /\p{M}/u;
const DIGIT = /\p{N}/u;
const SPACE = /\s/u;
/** Fins de phrase (critère 6). */
const SENTENCE_END = new Set([".", "!", "?"]);
/** Apostrophes : « l'école » est un seul mot, qui devient « L'école ». */
const APOSTROPHES = new Set(["'", "’"]);

const upper = (char: string) => char.toLocaleUpperCase(LOCALE);
const lower = (char: string) => char.toLocaleLowerCase(LOCALE);

/**
 * Convertit la partie `[start, end)` d'un paragraphe, en tenant compte du texte qui la précède
 * (une phrase ou un mot commencé avant la sélection n'a pas de majuscule).
 *
 * - « Première lettre de la phrase » : majuscule à la première lettre du paragraphe et à la première
 *   lettre qui suit `.`, `!` ou `?` puis une espace (« 3.5 » ou « www.site.fr » ne coupent pas la
 *   phrase), minuscules partout ailleurs.
 * - « Première Lettre De Chaque Mot » : majuscule à chaque lettre qui suit autre chose qu'une lettre,
 *   un chiffre ou une apostrophe (« Jean-Pierre », « L'école »), minuscules ailleurs.
 *
 * Les chiffres, la ponctuation, les emojis et les accents combinés ne changent pas (critère 3).
 * Le résultat peut être plus long que le texte d'origine (« ß » donne « SS »).
 * @param text texte du paragraphe entier
 * @param start début de la partie à convertir, en unités UTF-16, jamais au milieu d'un emoji
 * @param end fin de la partie à convertir
 */
export function convertCase(text: string, start: number, end: number, mode: CaseMode): string {
  let result = "";
  let sentenceStart = true;
  let afterSentenceEnd = false;
  let previous = "";
  let index = 0;
  for (const char of text) {
    if (index >= end) break;
    let converted = char;
    if (LETTER.test(char)) {
      if (mode === "upper") converted = upper(char);
      else if (mode === "lower") converted = lower(char);
      else if (mode === "sentence") converted = sentenceStart ? upper(char) : lower(char);
      else converted = isWordStart(previous) ? upper(char) : lower(char);
      sentenceStart = false;
      afterSentenceEnd = false;
    } else if (DIGIT.test(char)) {
      sentenceStart = false;
      afterSentenceEnd = false;
    } else if (SENTENCE_END.has(char)) {
      afterSentenceEnd = true;
    } else if (SPACE.test(char) && afterSentenceEnd) {
      sentenceStart = true;
      afterSentenceEnd = false;
    }
    if (index >= start) result += converted;
    if (!MARK.test(char)) previous = char;
    index += char.length;
  }
  return result;
}

/** Vrai si une lettre qui suit `previous` commence un mot. */
function isWordStart(previous: string): boolean {
  return !(LETTER.test(previous) || DIGIT.test(previous) || APOSTROPHES.has(previous));
}
