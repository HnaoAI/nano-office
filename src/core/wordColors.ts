// Couleurs du texte et du surlignage pour l'export Word (T2.7) : couleur `#RRGGBB` sans `#`, et
// surlignage de Word le plus proche. Logique pure, découpée de wordBlocks.ts (M1), sans changement.
import { HighlightColor } from "docx";

/** Couleur `#RRGGBB` en composantes, ou null. */
function rgb(color: unknown): [number, number, number] | null {
  if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) return null;
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Couleur sans `#`, pour Word, ou undefined si ce n'est pas une couleur `#RRGGBB`. */
export function wordColor(color: unknown): string | undefined {
  return rgb(color) ? (color as string).slice(1).toUpperCase() : undefined;
}

/** Teinte d'une couleur, en degrés (0 à 360). */
function hue([r, g, b]: [number, number, number]): number {
  const max = Math.max(r, g, b);
  const range = max - Math.min(r, g, b);
  if (range === 0) return 0;
  const raw =
    max === r ? ((g - b) / range) % 6 : max === g ? (b - r) / range + 2 : (r - g) / range + 4;
  return (raw * 60 + 360) % 360;
}

/** Couleurs vives du surlignage de Word, par teinte. */
const WORD_HIGHLIGHT_HUES = [
  { hue: 0, color: HighlightColor.RED },
  { hue: 60, color: HighlightColor.YELLOW },
  { hue: 120, color: HighlightColor.GREEN },
  { hue: 180, color: HighlightColor.CYAN },
  { hue: 240, color: HighlightColor.BLUE },
  { hue: 300, color: HighlightColor.MAGENTA },
];

/**
 * Surlignages de la palette (T1.7) et leur équivalent Word, choisis à l'œil : les couleurs pâles de la
 * palette sont trop loin des couleurs vives de Word pour un calcul (le vert pâle tire sur le jaune).
 */
const PALETTE_HIGHLIGHTS: Record<string, (typeof HighlightColor)[keyof typeof HighlightColor]> = {
  "#FFF176": HighlightColor.YELLOW,
  "#C5E1A5": HighlightColor.GREEN,
  "#B3E5FC": HighlightColor.CYAN,
  "#F8BBD0": HighlightColor.MAGENTA,
};

/**
 * Couleur de surlignage de Word la plus proche d'une couleur (T2.7, critère 3). Word n'a que seize
 * couleurs : celles de la palette ont leur équivalent fixé ; une autre (fichier modifié à la main) prend
 * la couleur vive de teinte la plus proche, le gris clair si elle est grise, le jaune si elle est illisible.
 */
export function nearestHighlight(
  color: unknown,
): (typeof HighlightColor)[keyof typeof HighlightColor] {
  const value = rgb(color);
  if (!value) return HighlightColor.YELLOW;
  const fromPalette = PALETTE_HIGHLIGHTS[(color as string).toUpperCase()];
  if (fromPalette) return fromPalette;
  if (Math.max(...value) - Math.min(...value) < 24) return HighlightColor.LIGHT_GRAY;
  const target = hue(value);
  const distance = (entry: { hue: number }) => {
    const gap = Math.abs(entry.hue - target);
    return Math.min(gap, 360 - gap);
  };
  return WORD_HIGHLIGHT_HUES.reduce((best, entry) =>
    distance(entry) < distance(best) ? entry : best,
  ).color;
}
