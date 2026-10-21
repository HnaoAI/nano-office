// Interligne des paragraphes (T2.2) : valeurs proposées, hauteur de ligne CSS équivalente à celle de
// Word, et attribut de bloc `lineHeight` du schéma. Données et rendu HTML seulement, sans navigateur.
import { Extension } from "@tiptap/core";

/**
 * Interlignes proposés, écrits comme dans Word (« 1,15 »). La valeur enregistrée est celle de Word
 * (`"1.15"`), pour qu'un export Word (T2.7) la reprenne telle quelle ; l'absence d'attribut vaut
 * « Par défaut », l'interligne de la charte (1,65).
 * INVARIANT : ces chaînes sont écrites dans les fichiers `.nano` ; les changer rendrait l'interligne
 * des documents existants inconnu.
 */
export const LINE_HEIGHTS = [
  { value: "1", label: "1" },
  { value: "1.15", label: "1,15" },
  { value: "1.5", label: "1,5" },
  { value: "2", label: "2" },
] as const;

/** Interligne enregistré dans un bloc. */
export type LineHeight = (typeof LINE_HEIGHTS)[number]["value"];

/**
 * Hauteur d'une ligne simple de Word, en multiple de la taille du texte (T2.2, critère 3) : l'interligne
 * « 1 » de Word vaut environ 1,2 fois la taille des caractères.
 */
export const WORD_SINGLE_LINE = 1.2;

/** Bornes raisonnables d'un interligne venu d'un fichier ; au-delà, il est gardé mais ignoré à l'affichage. */
const MIN_LINE_HEIGHT = 0.5;
const MAX_LINE_HEIGHT = 5;

/**
 * Hauteur de ligne CSS d'un interligne enregistré (`"1.5"` → `"1.8"`), ou null s'il n'est pas un
 * nombre raisonnable. Arrondie au centième : `"1.15"` donne `"1.38"`.
 */
export function cssLineHeight(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  if (number < MIN_LINE_HEIGHT || number > MAX_LINE_HEIGHT) return null;
  return String(Math.round(number * WORD_SINGLE_LINE * 100) / 100);
}

/** Blocs qui portent un interligne : paragraphes (y compris dans les listes et les cellules) et titres. */
export const LINE_HEIGHT_TYPES = ["paragraph", "heading"];

/**
 * Attribut `lineHeight` des paragraphes et des titres (T2.2), comme l'alignement : un attribut de
 * bloc, sans changement de structure du format (critère 8). Il est rendu en style et dans
 * `data-line-height`, seul relu au collage : un collage interne le garde, et un collage extérieur
 * le retire (src/editor/clipboard.ts). Gardé quand Entrée coupe le bloc, comme dans Word.
 */
export const LineHeightAttribute = Extension.create({
  name: "lineHeight",
  addGlobalAttributes() {
    return [
      {
        types: LINE_HEIGHT_TYPES,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-line-height"),
            renderHTML: (attributes) => {
              const css = cssLineHeight(attributes.lineHeight);
              return css === null
                ? {}
                : {
                    "data-line-height": attributes.lineHeight as string,
                    style: `line-height: ${css}`,
                  };
            },
          },
        },
      },
    ];
  },
});
