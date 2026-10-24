// Retrait de paragraphe (T2.14) : niveaux proposés, largeur d'un niveau, et attribut de bloc `indent` du schéma,
// comme l'interligne (T2.2). Données et rendu HTML seulement, sans navigateur.
import { Extension } from "@tiptap/core";

/** Nombre maximal de niveaux de retrait (critère 1). */
export const MAX_INDENT = 5;

/** Largeur d'un niveau de retrait, en centimètres : 1,25 cm, celle d'une tabulation de Word (critère 1). */
export const INDENT_STEP_CM = 1.25;

/** Blocs qui portent un retrait : paragraphes et titres. Dans une liste, les boutons décalent l'élément. */
export const INDENT_TYPES = ["paragraph", "heading"];

/**
 * Niveau de retrait valide (1 à 5) lu dans un attribut ou un fichier, ou 0 sans retrait. Une valeur hors bornes,
 * venue d'un fichier modifié à la main, est ramenée dans les bornes.
 */
export function indentLevel(value: unknown): number {
  const level = typeof value === "string" ? Number.parseInt(value, 10) : value;
  if (typeof level !== "number" || !Number.isInteger(level) || level <= 0) return 0;
  return Math.min(level, MAX_INDENT);
}

/**
 * Attribut `indent` des paragraphes et des titres (T2.14) : le nombre de niveaux de retrait, ou null sans retrait.
 * Un attribut de bloc, sans changement de version du format (critère 4). Rendu en marge de gauche et dans
 * `data-indent`, seul relu au collage : un collage interne le garde, un collage extérieur le retire
 * (src/editor/clipboard.ts, critère 3). Gardé quand Entrée coupe le bloc, comme dans Word.
 */
export const IndentAttribute = Extension.create({
  name: "indent",
  addGlobalAttributes() {
    return [
      {
        types: INDENT_TYPES,
        attributes: {
          indent: {
            default: null,
            parseHTML: (element) => {
              const level = indentLevel(element.getAttribute("data-indent"));
              return level === 0 ? null : level;
            },
            renderHTML: (attributes) => {
              const level = indentLevel(attributes.indent);
              return level === 0
                ? {}
                : {
                    "data-indent": String(level),
                    style: `margin-left: ${String(level * INDENT_STEP_CM)}cm`,
                  };
            },
          },
        },
      },
    ];
  },
});
