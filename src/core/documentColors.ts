// Couleurs du document (T1.7) : palettes fixes de la couleur du texte et du surlignage.
// Données seulement, sans navigateur. Ce sont les seules couleurs affichées par l'interface.

/** Une pastille de palette : son nom affiché, et sa couleur, ou null pour retirer la mise en forme. */
export interface PaletteColor {
  name: string;
  value: string | null;
}

/**
 * Couleurs du texte (T1.7, critère 3). « Automatique » retire la couleur : le texte reprend celle
 * du document.
 * INVARIANT : les valeurs sont écrites telles quelles dans les fichiers `.nano` ; les changer
 * laisserait les textes déjà colorés hors de la palette (le bouton resterait neutre).
 */
export const TEXT_COLORS: readonly PaletteColor[] = [
  { name: "Automatique", value: null },
  { name: "Gris", value: "#6B6B68" },
  { name: "Rouge", value: "#C62828" },
  { name: "Orange", value: "#D84315" },
  { name: "Vert", value: "#2E7D32" },
  { name: "Bleu", value: "#1565C0" },
  { name: "Violet", value: "#6A1B9A" },
];

/** Couleurs du surlignage (T1.7, critère 4). « Aucun » retire le surlignage. */
export const HIGHLIGHT_COLORS: readonly PaletteColor[] = [
  { name: "Aucun", value: null },
  { name: "Jaune", value: "#FFF176" },
  { name: "Vert", value: "#C5E1A5" },
  { name: "Bleu", value: "#B3E5FC" },
  { name: "Rose", value: "#F8BBD0" },
];

/**
 * Vrai si deux couleurs sont la même, sans tenir compte des majuscules (`#c62828` = `#C62828`) ;
 * null (aucune couleur) n'égale que null.
 */
export function sameColor(a: string | null, b: string | null): boolean {
  return a === null || b === null ? a === b : a.trim().toLowerCase() === b.trim().toLowerCase();
}
