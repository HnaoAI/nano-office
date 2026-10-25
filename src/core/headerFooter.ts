// Numéros de page (T2.15), en-tête et pied de page (T2.16) : ce qui s'imprime dans les marges de chaque
// page. Rangés avec la mise en page (T2.5), dans la `Y.Map` « page » du Y.Doc, et écrits comme attributs
// du nœud `doc` de `content`, sans changement de version du format. Logique pure, dépend seulement de Yjs.
// Règles `@page` de l'impression ici ; l'export Word est dans wordExport.ts, l'écran dans src/ui/.
import type * as Y from "yjs";
import { PAGE_MAP_NAME, PAGE_SETUP_ORIGIN } from "./pageSetup";
import type { DocumentJson } from "./types";

/**
 * Clés dans la `Y.Map` « page » et dans les attributs du nœud `doc` de `content`.
 * INVARIANT : ces noms sont écrits dans les fichiers `.nano` et les copies de secours.
 */
export const PAGE_NUMBERS_KEY = "pageNumbers";
export const PAGE_HEADER_KEY = "pageHeader";
export const PAGE_FOOTER_KEY = "pageFooter";
export const HEADER_FOOTER_SKIP_FIRST_KEY = "headerFooterSkipFirst";

const KEYS = [
  PAGE_NUMBERS_KEY,
  PAGE_HEADER_KEY,
  PAGE_FOOTER_KEY,
  HEADER_FOOTER_SKIP_FIRST_KEY,
] as const;

/** Position du numéro de page (T2.15, critère 1). */
export type PageNumberPosition = "center" | "right";

/** Alignement d'un en-tête ou d'un pied de page (T2.16, critère 1). */
export type MarginTextAlign = "left" | "center" | "right";

/** Numérotation des pages, quand elle est allumée. */
export interface PageNumbers {
  position: PageNumberPosition;
  /** « Pas de numéro sur la première page ». */
  skipFirst: boolean;
}

/** En-tête ou pied de page : une ligne de texte simple et son alignement. */
export interface MarginText {
  text: string;
  align: MarginTextAlign;
}

/** Tout ce qui s'imprime dans les marges des pages d'un document. */
export interface HeaderFooter {
  /** null : pages non numérotées (par défaut, T2.15, critère 1). */
  pageNumbers: PageNumbers | null;
  header: MarginText;
  footer: MarginText;
  /** « Pas d'en-tête ni de pied de page sur la première page », pour une page de garde (T2.16, critère 4). */
  skipFirst: boolean;
}

/** Longueur maximale d'un en-tête ou d'un pied de page, en caractères : une ligne. */
export const MAX_MARGIN_TEXT = 200;

/** Pas de numéro, ni d'en-tête, ni de pied de page. */
export const DEFAULT_HEADER_FOOTER: HeaderFooter = {
  pageNumbers: null,
  header: { text: "", align: "left" },
  footer: { text: "", align: "left" },
  skipFirst: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Texte d'en-tête ou de pied de page ramené à une ligne de texte simple : retours à la ligne et
 * tabulations remplacés par une espace, caractères de contrôle retirés, espaces du début et de la fin
 * retirées, 200 caractères au plus, sans couper un emoji.
 */
export function cleanMarginText(value: unknown): string {
  if (typeof value !== "string") return "";
  const line = value
    .replace(/[\r\n\t\u2028\u2029]+/g, " ")
    // eslint-disable-next-line no-control-regex -- on retire justement les caractères de contrôle
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return Array.from(line).slice(0, MAX_MARGIN_TEXT).join("").trim();
}

function readAlign(value: unknown): MarginTextAlign {
  return value === "center" || value === "right" ? value : "left";
}

function readMarginText(value: unknown): MarginText {
  const values = isRecord(value) ? value : {};
  return { text: cleanMarginText(values.text), align: readAlign(values.align) };
}

/**
 * Réglages décrits par des attributs (ceux du nœud `doc` de `content`, ou le contenu de la `Y.Map`).
 * Une valeur absente ou invalide (fichier modifié à la main) vaut celle par défaut, sans bloquer
 * l'ouverture.
 */
export function headerFooterFromAttrs(attrs: unknown): HeaderFooter {
  const values = isRecord(attrs) ? attrs : {};
  const numbers = values[PAGE_NUMBERS_KEY];
  return {
    pageNumbers: isRecord(numbers)
      ? {
          position: numbers.position === "right" ? "right" : "center",
          skipFirst: numbers.skipFirst === true,
        }
      : null,
    header: readMarginText(values[PAGE_HEADER_KEY]),
    footer: readMarginText(values[PAGE_FOOTER_KEY]),
    skipFirst: values[HEADER_FOOTER_SKIP_FIRST_KEY] === true,
  };
}

/**
 * Attributs à écrire : rien pour une valeur par défaut, pour qu'un document sans numéro, sans en-tête ni
 * pied de page soit identique à un document jamais réglé. Un en-tête vide n'écrit pas son alignement.
 */
export function headerFooterAttrs(settings: HeaderFooter): Record<string, unknown> {
  const clean = headerFooterFromAttrs({
    [PAGE_NUMBERS_KEY]: settings.pageNumbers ?? undefined,
    [PAGE_HEADER_KEY]: settings.header,
    [PAGE_FOOTER_KEY]: settings.footer,
    [HEADER_FOOTER_SKIP_FIRST_KEY]: settings.skipFirst,
  });
  const attrs: Record<string, unknown> = {};
  if (clean.pageNumbers) attrs[PAGE_NUMBERS_KEY] = { ...clean.pageNumbers };
  if (clean.header.text) attrs[PAGE_HEADER_KEY] = { ...clean.header };
  if (clean.footer.text) attrs[PAGE_FOOTER_KEY] = { ...clean.footer };
  if (clean.skipFirst) attrs[HEADER_FOOTER_SKIP_FIRST_KEY] = true;
  return attrs;
}

/** Réglages d'un Y.Doc (par défaut si rien n'est réglé). */
export function readHeaderFooter(ydoc: Y.Doc): HeaderFooter {
  return headerFooterFromAttrs(ydoc.getMap(PAGE_MAP_NAME).toJSON());
}

/**
 * Enregistre les réglages dans le Y.Doc, en une transaction d'origine `PAGE_SETUP_ORIGIN`, annulable
 * avec la mise en page en une fois (T2.5, critère 5). Des réglages inchangés n'écrivent rien.
 */
export function writeHeaderFooter(ydoc: Y.Doc, settings: HeaderFooter): void {
  const attrs = headerFooterAttrs(settings);
  const current = headerFooterAttrs(readHeaderFooter(ydoc));
  if (JSON.stringify(current) === JSON.stringify(attrs)) return;
  const map = ydoc.getMap(PAGE_MAP_NAME);
  ydoc.transact(() => {
    for (const key of KEYS) {
      if (key in attrs) map.set(key, attrs[key]);
      else if (map.has(key)) map.delete(key);
    }
  }, PAGE_SETUP_ORIGIN);
}

/**
 * Document JSON complété par les attributs des numéros, de l'en-tête et du pied de page (pour
 * `content`). Le JSON reçu n'est pas modifié ; un document sans réglage reste tel quel.
 */
export function withHeaderFooterAttrs(content: DocumentJson, ydoc: Y.Doc): DocumentJson {
  const attrs = headerFooterAttrs(readHeaderFooter(ydoc));
  return Object.keys(attrs).length > 0
    ? { ...content, attrs: { ...content.attrs, ...attrs } }
    : content;
}

/** Un morceau d'une zone de marge : du texte, ou le numéro de la page. */
export type MarginPart = { kind: "text"; text: string } | { kind: "page" };

/** Contenu des zones de marge d'une page, en haut et en bas, par alignement. Une zone vide est absente. */
export interface MarginBoxes {
  top: Partial<Record<MarginTextAlign, MarginPart[]>>;
  bottom: Partial<Record<MarginTextAlign, MarginPart[]>>;
}

/**
 * Ce qui s'imprime dans les marges de la première page, ou des suivantes.
 * Un pied de page aligné comme le numéro partage sa zone : le texte, puis le numéro, séparés d'un tiret,
 * pour ne jamais se chevaucher (T2.16, critère 2).
 * @param settings réglages du document
 * @param firstPage vrai pour la première page (cases « première page » de T2.15 et T2.16)
 */
export function marginBoxes(settings: HeaderFooter, firstPage: boolean): MarginBoxes {
  const boxes: MarginBoxes = { top: {}, bottom: {} };
  const showTexts = !(firstPage && settings.skipFirst);
  const { header, footer, pageNumbers } = settings;
  if (showTexts && header.text) boxes.top[header.align] = [{ kind: "text", text: header.text }];
  if (showTexts && footer.text) boxes.bottom[footer.align] = [{ kind: "text", text: footer.text }];
  if (pageNumbers && !(firstPage && pageNumbers.skipFirst)) {
    const shared = boxes.bottom[pageNumbers.position];
    boxes.bottom[pageNumbers.position] = shared
      ? [...shared, { kind: "text", text: " – " }, { kind: "page" }]
      : [{ kind: "page" }];
  }
  return boxes;
}

/** Couleur du texte discret de la charte (`--nano-text-quiet`) : les variables CSS n'atteignent pas `@page`. */
const PRINT_MARGIN_COLOR = "#5f5f5c";

/** Chaîne CSS entre guillemets : guillemets, barres obliques inverses et chevrons échappés. */
function cssString(text: string): string {
  return `"${text.replace(/["\\<>]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `)}"`;
}

/** Valeur `content` d'une zone de marge, ou `none`. */
function cssContent(parts: readonly MarginPart[] | undefined): string {
  if (!parts || parts.length === 0) return "none";
  return parts
    .map((part) => (part.kind === "page" ? "counter(page)" : cssString(part.text)))
    .join(" ");
}

const ALIGNS: readonly MarginTextAlign[] = ["left", "center", "right"];

/** Règles des six zones de marge (en haut et en bas, à gauche, au centre et à droite). */
function cssBoxes(boxes: MarginBoxes, all: boolean): string {
  const rules: string[] = [];
  for (const side of ["top", "bottom"] as const) {
    for (const align of ALIGNS) {
      const parts = boxes[side][align];
      // Pour la première page, toutes les zones sont écrites, pour effacer celles des autres pages.
      if (!all && !parts) continue;
      rules.push(
        `@${side}-${align} { content: ${cssContent(parts)}; font-family: "IBM Plex Sans", sans-serif; ` +
          `font-size: 10pt; color: ${PRINT_MARGIN_COLOR}; }`,
      );
    }
  }
  return rules.join(" ");
}

/**
 * Règles `@page` des numéros, de l'en-tête et du pied de page à l'impression et dans le PDF (T2.15,
 * critère 2 ; T2.16, critère 2) : zones de marge `@top-left` à `@bottom-right` et `counter(page)`,
 * prises en charge par Chrome et Edge, en IBM Plex Sans 10 pt. Chaîne vide si rien n'est réglé.
 * Les textes sont échappés : rien d'autre qu'une chaîne CSS n'est écrit.
 */
export function printMarginRules(settings: HeaderFooter): string {
  const clean = headerFooterFromAttrs(headerFooterAttrs(settings));
  const others = marginBoxes(clean, false);
  const first = marginBoxes(clean, true);
  if (Object.keys(others.top).length + Object.keys(others.bottom).length === 0) return "";
  const rules = [`@page { ${cssBoxes(others, false)} }`];
  if (JSON.stringify(first) !== JSON.stringify(others)) {
    rules.push(`@page :first { ${cssBoxes(first, true)} }`);
  }
  return rules.join("\n");
}
