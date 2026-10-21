// Rechercher et remplacer (T2.1) : recherche d'un texte dans le texte d'un paragraphe, en code pur.
// src/editor/search.ts l'applique à chaque bloc du document et en tire les surlignages.

/** Une occurrence trouvée : position de début et de fin dans le texte cherché, en unités UTF-16. */
export interface TextMatch {
  from: number;
  to: number;
}

/** Langue des règles de majuscules : « É » et « é » sont la même lettre. */
const LOCALE = "fr";

/**
 * Texte ramené en minuscules, caractère par caractère, sans changer sa longueur : une position dans
 * le texte ramené est la même dans le texte d'origine. Les rares lettres dont la minuscule change de
 * longueur (« İ » turc) restent telles quelles.
 */
export function foldCase(text: string): string {
  let result = "";
  for (const char of text) {
    const lower = char.toLocaleLowerCase(LOCALE);
    result += lower.length === char.length ? lower : char;
  }
  return result;
}

/**
 * Toutes les occurrences de `query` dans `text`, sans chevauchement, de gauche à droite.
 * La recherche ignore les majuscules, sauf si `caseSensitive` (critère 3). Un texte cherché vide
 * ne trouve rien (critère 8). Les accents comptent : « e » ne trouve pas « é ».
 */
export function findInText(text: string, query: string, caseSensitive: boolean): TextMatch[] {
  if (query === "") return [];
  const haystack = caseSensitive ? text : foldCase(text);
  const needle = caseSensitive ? query : foldCase(query);
  const matches: TextMatch[] = [];
  for (
    let index = haystack.indexOf(needle);
    index >= 0;
    index = haystack.indexOf(needle, index + needle.length)
  ) {
    matches.push({ from: index, to: index + needle.length });
  }
  return matches;
}

/**
 * Texte de la barre de recherche : « 3 sur 12 », « Aucun résultat », ou rien sans texte cherché
 * (critère 2). « Fin du document » quand « Remplacer » a traité la dernière occurrence.
 * @param active indice de l'occurrence active, ou -1
 */
export function searchStatus(query: string, active: number, total: number): string {
  if (query === "") return "";
  if (total === 0) return "Aucun résultat";
  if (active < 0) return "Fin du document";
  return `${String(active + 1)} sur ${String(total)}`;
}

/** Texte affiché après « Tout remplacer » : « 12 remplacements », « 1 remplacement » (critère 6). */
export function replacementStatus(count: number): string {
  return count === 1 ? "1 remplacement" : `${String(count)} remplacements`;
}
