// Police et taille du texte (T1.4) : polices intégrées, tailles proposées, et attributs `fontFamily`
// et `fontSize` de la marque `textStyle` du schéma. Données et rendu HTML seulement, sans navigateur.
import { Extension } from "@tiptap/core";

/**
 * Polices du document, toutes sous licence SIL OFL 1.1 et livrées avec l'application
 * (src/ui/fonts.ts). Chacune a sa pile CSS : son nom, puis une famille générique de secours.
 * INVARIANT : les noms sont ceux écrits dans les fichiers `.nano` ; les changer rendrait la police
 * des documents existants inconnue.
 */
export const DOCUMENT_FONTS = [
  { name: "IBM Plex Sans", stack: '"IBM Plex Sans", sans-serif' },
  { name: "IBM Plex Serif", stack: '"IBM Plex Serif", serif' },
  { name: "IBM Plex Mono", stack: '"IBM Plex Mono", monospace' },
  { name: "Source Sans 3", stack: '"Source Sans 3", sans-serif' },
  { name: "EB Garamond", stack: '"EB Garamond", serif' },
] as const;

/** Police d'un nouveau document (T1.4, critère 5) : celle de l'éditeur, sans attribut. */
export const DEFAULT_FONT = "IBM Plex Sans";

/** Tailles proposées, en points (T1.4, critère 2). 12 points valent les 16 px du texte de la charte. */
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72] as const;

/** Taille d'un nouveau document, en points (T1.4, critère 5). */
export const DEFAULT_FONT_SIZE = 12;

/**
 * Pile CSS d'une police. Une police inconnue (par exemple venue d'une future version) s'affiche avec
 * la police par défaut, même si elle est installée sur l'ordinateur : le document reste identique
 * sur le Mac et sur le PC (T1.4, critère 8).
 */
export function fontStack(name: string): string {
  const known = DOCUMENT_FONTS.find((font) => font.name === name);
  return known?.stack ?? DOCUMENT_FONTS[0].stack;
}

/** Taille écrite dans le fichier pour un nombre de points, par exemple `14pt`. */
export function fontSizeValue(points: number): string {
  return `${String(points)}pt`;
}

/** Nombre de points d'une taille enregistrée (`14pt`), ou null si elle n'est pas en points. */
export function fontSizePoints(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+(?:\.\d+)?)pt$/.exec(value);
  return match ? Number(match[1]) : null;
}

/** Premier nom d'une liste CSS de polices, sans guillemets (`"EB Garamond", serif` → `EB Garamond`). */
function firstFamily(cssValue: string): string | null {
  const first = cssValue
    .split(",")[0]
    ?.trim()
    .replace(/^["']|["']$/g, "");
  return first ? first : null;
}

/**
 * Attributs `fontFamily` (nom de la police) et `fontSize` (`14pt`) de la marque `textStyle`.
 * Écrit à la main plutôt qu'avec FontFamily et FontSize de Tiptap, qui écriraient le nom tel quel dans
 * le style, sans police de secours : une police inconnue s'afficherait alors en Times.
 * Le nom exact est aussi rendu dans `data-font`, relu au collage interne (T1.5) : il survit même
 * pour une police inconnue, que le style remplace.
 */
export const TextStyleAttributes = Extension.create({
  name: "textStyleAttributes",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (element) =>
              element.getAttribute("data-font") ?? firstFamily(element.style.fontFamily),
            renderHTML: (attributes) => {
              const name: unknown = attributes.fontFamily;
              if (typeof name !== "string" || name === "") return {};
              return { "data-font": name, style: `font-family: ${fontStack(name)}` };
            },
          },
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              const points = fontSizePoints(attributes.fontSize);
              return points === null ? {} : { style: `font-size: ${fontSizeValue(points)}` };
            },
          },
        },
      },
    ];
  },
});
