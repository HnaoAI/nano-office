// Ouverture d'un fichier Word (T2.18) : styles, polices du thème, numérotation des listes, et propriétés
// de paragraphe et de texte ramenées à celles de Nano Buro (police intégrée la plus proche, couleur la plus
// proche de la palette, interligne, retrait). Logique pure ; le XML est lu par wordXml.ts.
import { HIGHLIGHT_COLORS, TEXT_COLORS } from "./documentColors";
import { INDENT_STEP_CM, MAX_INDENT } from "./indent";
import { LINE_HEIGHTS } from "./lineHeight";
import { DEFAULT_FONT, DEFAULT_FONT_SIZE, DOCUMENT_FONTS } from "./textStyle";
import { descendants, intAttr, onOff, wAttr, wChild, wChildren, wVal } from "./wordXml";

/** Propriétés d'un paragraphe de Word, après les styles. Les longueurs sont en vingtièmes de point. */
export interface ParagraphProps {
  styleIds: string[];
  align: string | null;
  /** Interligne `w:spacing/@w:line`, avec sa règle (`auto` : en 240e de ligne). */
  line: number | null;
  lineRule: string | null;
  indentLeft: number | null;
  numId: string | null;
  ilvl: number;
  pageBreakBefore: boolean;
  /** Couleur de la bordure du paragraphe (`auto` sans couleur), ou null sans bordure. */
  border: string | null;
  /** Couleur de fond du paragraphe, ou null. */
  shading: string | null;
}

/** Propriétés d'un morceau de texte de Word, après les styles. */
export interface RunProps {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  vertAlign?: string;
  color?: string;
  highlight?: string;
  shading?: string;
  font?: string;
  /** Taille en demi-points. */
  size?: number;
  caps?: boolean;
  hidden?: boolean;
}

/** Style de Word : son nom, son parent et ses propriétés. */
interface WordStyle {
  type: string;
  name: string;
  basedOn: string | null;
  pPr: Element | null;
  rPr: Element | null;
}

/** Styles, thème et numérotation d'un fichier Word. */
export interface WordStyles {
  styles: Map<string, WordStyle>;
  defaultParagraphStyle: string | null;
  defaultPPr: Element | null;
  defaultRPr: Element | null;
  /** Polices du thème : `minor` (texte) et `major` (titres). */
  themeFonts: { minor: string | null; major: string | null };
  /** Format de chaque niveau de chaque liste : `numId` → niveau → `bullet`, `decimal`, `none`… */
  numbering: Map<string, Map<number, string>>;
}

/**
 * Lit les styles, le thème et la numérotation. Chacun est facultatif : un fichier sans `styles.xml` s'ouvre
 * avec les valeurs de Word.
 */
export function readWordStyles(
  styles: Element | null,
  theme: Element | null,
  numbering: Element | null,
): WordStyles {
  const result: WordStyles = {
    styles: new Map(),
    defaultParagraphStyle: null,
    defaultPPr: null,
    defaultRPr: null,
    themeFonts: { minor: null, major: null },
    numbering: readNumbering(numbering),
  };
  if (styles) {
    const defaults = wChild(styles, "docDefaults");
    result.defaultPPr = wChild(wChild(defaults, "pPrDefault"), "pPr");
    result.defaultRPr = wChild(wChild(defaults, "rPrDefault"), "rPr");
    for (const style of wChildren(styles, "style")) {
      const id = wAttr(style, "styleId");
      if (!id) continue;
      const type = wAttr(style, "type") ?? "paragraph";
      result.styles.set(id, {
        type,
        name: wVal(style, "name") ?? id,
        basedOn: wVal(style, "basedOn"),
        pPr: wChild(style, "pPr"),
        rPr: wChild(style, "rPr"),
      });
      if (type === "paragraph" && ["1", "true", "on"].includes(wAttr(style, "default") ?? "")) {
        result.defaultParagraphStyle = id;
      }
    }
  }
  if (theme) {
    for (const [key, tag] of [
      ["minor", "minorFont"],
      ["major", "majorFont"],
    ] as const) {
      const font = descendants(theme, tag)[0];
      const latin = font ? Array.from(font.children).find((el) => el.localName === "latin") : null;
      result.themeFonts[key] = latin?.getAttribute("typeface") || null;
    }
  }
  return result;
}

/** Numérotation : chaque `numId` mène à une liste abstraite, dont chaque niveau a un format. */
function readNumbering(numbering: Element | null): Map<string, Map<number, string>> {
  const result = new Map<string, Map<number, string>>();
  if (!numbering) return result;
  const levelsOf = (element: Element) => {
    const levels = new Map<number, string>();
    for (const lvl of wChildren(element, "lvl")) {
      levels.set(intAttr(wAttr(lvl, "ilvl")) ?? 0, wVal(lvl, "numFmt") ?? "decimal");
    }
    return levels;
  };
  const abstract = new Map<string, Map<number, string>>();
  for (const element of wChildren(numbering, "abstractNum")) {
    const id = wAttr(element, "abstractNumId");
    if (id !== null) abstract.set(id, levelsOf(element));
  }
  for (const num of wChildren(numbering, "num")) {
    const id = wAttr(num, "numId");
    if (id === null) continue;
    const levels = new Map(abstract.get(wVal(num, "abstractNumId") ?? "") ?? []);
    for (const override of wChildren(num, "lvlOverride")) {
      const lvl = wChild(override, "lvl");
      if (lvl) levels.set(intAttr(wAttr(override, "ilvl")) ?? 0, wVal(lvl, "numFmt") ?? "decimal");
    }
    result.set(id, levels);
  }
  return result;
}

/** Chaîne des styles, du plus général au style donné (au plus 20, pour un fichier qui boucle). */
function styleChain(styles: WordStyles, id: string | null): WordStyle[] {
  const chain: WordStyle[] = [];
  let current = id;
  while (current && chain.length < 20) {
    const style = styles.styles.get(current);
    if (!style) break;
    chain.unshift(style);
    current = style.basedOn;
  }
  return chain;
}

/** Identifiants de la chaîne de styles d'un paragraphe (le style par défaut s'il n'en a pas). */
function paragraphStyleIds(styles: WordStyles, pPr: Element | null): string[] {
  const id = wVal(pPr, "pStyle") ?? styles.defaultParagraphStyle;
  const ids: string[] = [];
  let current = id;
  while (current && ids.length < 20 && styles.styles.has(current)) {
    ids.unshift(current);
    current = styles.styles.get(current)?.basedOn ?? null;
  }
  return ids;
}

/** Applique les propriétés de paragraphe `pPr` à `props`. */
function applyPPr(props: ParagraphProps, pPr: Element | null, withSpacing: boolean): void {
  if (!pPr) return;
  const jc = wVal(pPr, "jc");
  if (jc) props.align = jc;
  const spacing = wChild(pPr, "spacing");
  if (spacing && withSpacing) {
    const line = intAttr(wAttr(spacing, "line"));
    if (line !== null) {
      props.line = line;
      props.lineRule = wAttr(spacing, "lineRule") ?? "auto";
    }
  }
  const ind = wChild(pPr, "ind");
  const left = intAttr(wAttr(ind, "left") ?? wAttr(ind, "start"));
  if (left !== null) props.indentLeft = left;
  const numPr = wChild(pPr, "numPr");
  if (numPr) {
    const numId = wVal(numPr, "numId");
    if (numId !== null) props.numId = numId;
    const ilvl = intAttr(wVal(numPr, "ilvl"));
    if (ilvl !== null) props.ilvl = ilvl;
  }
  const breakBefore = onOff(wChild(pPr, "pageBreakBefore"));
  if (breakBefore !== undefined) props.pageBreakBefore = breakBefore;
  const pBdr = wChild(pPr, "pBdr");
  if (pBdr) {
    const sides = ["top", "left", "bottom", "right"]
      .map((side) => wChild(pBdr, side))
      .filter((side): side is Element => {
        const val = wAttr(side, "val");
        return side !== null && val !== null && val !== "none" && val !== "nil";
      });
    props.border = sides.length > 0 ? (wAttr(sides[0], "color") ?? "auto") : null;
  }
  const shd = wChild(pPr, "shd");
  if (shd) props.shading = visibleFill(wAttr(shd, "fill"));
}

/** Couleur de fond visible (`#RRGGBB`), ou null pour `auto`, le blanc ou une valeur illisible. */
function visibleFill(fill: string | null): string | null {
  if (!fill || !/^[0-9a-f]{6}$/i.test(fill) || fill.toUpperCase() === "FFFFFF") return null;
  return `#${fill.toUpperCase()}`;
}

/**
 * Propriétés d'un paragraphe : valeurs par défaut du fichier, chaîne de styles, puis mise en forme directe.
 * Pour un titre, l'interligne des styles est ignoré : celui des titres de Nano Buro s'applique (choix T2.18).
 */
export function paragraphProps(
  styles: WordStyles,
  pPr: Element | null,
  isHeading: (ids: string[]) => boolean,
): ParagraphProps {
  const styleIds = paragraphStyleIds(styles, pPr);
  const heading = isHeading(styleIds);
  const props: ParagraphProps = {
    styleIds,
    align: null,
    line: null,
    lineRule: null,
    indentLeft: null,
    numId: null,
    ilvl: 0,
    pageBreakBefore: false,
    border: null,
    shading: null,
  };
  applyPPr(props, styles.defaultPPr, !heading);
  for (const id of styleIds) applyPPr(props, styles.styles.get(id)?.pPr ?? null, !heading);
  applyPPr(props, pPr, true);
  return props;
}

/** Applique les propriétés de texte `rPr` à `props`. */
function applyRPr(props: RunProps, rPr: Element | null, styles: WordStyles): void {
  if (!rPr) return;
  const toggles = [
    ["b", "bold"],
    ["i", "italic"],
    ["caps", "caps"],
    ["vanish", "hidden"],
  ] as const;
  for (const [tag, key] of toggles) {
    const value = onOff(wChild(rPr, tag));
    if (value !== undefined) props[key] = value;
  }
  const strike = onOff(wChild(rPr, "strike")) ?? onOff(wChild(rPr, "dstrike"));
  if (strike !== undefined) props.strike = strike;
  const u = wChild(rPr, "u");
  if (u) props.underline = (wAttr(u, "val") ?? "single") !== "none";
  const vertAlign = wVal(rPr, "vertAlign");
  if (vertAlign) props.vertAlign = vertAlign;
  const color = wVal(rPr, "color");
  if (color) props.color = color;
  const highlight = wVal(rPr, "highlight");
  if (highlight) props.highlight = highlight;
  const shd = wChild(rPr, "shd");
  if (shd) props.shading = visibleFill(wAttr(shd, "fill")) ?? "";
  const fonts = wChild(rPr, "rFonts");
  if (fonts) {
    const theme = wAttr(fonts, "asciiTheme") ?? wAttr(fonts, "hAnsiTheme");
    const named = wAttr(fonts, "ascii") ?? wAttr(fonts, "hAnsi");
    const fromTheme = theme
      ? theme.startsWith("major")
        ? styles.themeFonts.major
        : styles.themeFonts.minor
      : null;
    const font = fromTheme ?? named;
    if (font) props.font = font;
  }
  const size = intAttr(wVal(rPr, "sz"));
  if (size !== null && size > 0) props.size = size;
}

/**
 * Propriétés d'un morceau de texte : valeurs par défaut, styles du paragraphe, style de caractère, puis mise en
 * forme directe. Dans un titre, la mise en forme des styles est ignorée : la police, la taille et la couleur des
 * titres de Nano Buro s'appliquent (choix T2.18). Seule la mise en forme choisie à la main est reprise.
 */
export function runProps(
  styles: WordStyles,
  paragraph: ParagraphProps,
  heading: boolean,
  rPr: Element | null,
): RunProps {
  const props: RunProps = {};
  if (!heading) {
    applyRPr(props, styles.defaultRPr, styles);
    for (const id of paragraph.styleIds)
      applyRPr(props, styles.styles.get(id)?.rPr ?? null, styles);
  }
  for (const style of styleChain(styles, wVal(rPr, "rStyle"))) {
    // Le style « Lien hypertexte » ne fait que souligner en bleu : le lien de Nano Buro le fait déjà.
    if (style.type === "character" && !/hyperlink|lien/i.test(style.name)) {
      applyRPr(props, style.rPr, styles);
    }
  }
  applyRPr(props, rPr, styles);
  return props;
}

/** Niveau de titre (1 à 3) des noms « heading 1 » à « heading 9 », « Titre 1 »…, « Title » ; 0 sinon. */
export function headingLevelOf(styles: WordStyles, ids: readonly string[]): number {
  for (const id of [...ids].reverse()) {
    const name = styles.styles.get(id)?.name ?? id;
    for (const candidate of [name, id]) {
      const match = /^(?:heading|titre|überschrift|titolo|título)\s*([1-9])$/i.exec(
        candidate.trim(),
      );
      if (match) return Math.min(Number(match[1]), 3);
      if (/^title$/i.test(candidate.trim())) return 1;
    }
  }
  return 0;
}

/** Vrai si le style a un nom de titre du sommaire de Word (« TOC Heading », « En-tête de table des matières »). */
export function isTocHeadingStyle(styles: WordStyles, ids: readonly string[]): boolean {
  return ids.some((id) =>
    /^(toc heading|en-tête de table des matières|tocheading)$/i.test(
      styles.styles.get(id)?.name ?? id,
    ),
  );
}

/** Format d'un niveau d'une liste (`bullet`, `decimal`, `none`…), ou null si la liste n'existe pas. */
export function listFormat(styles: WordStyles, numId: string, ilvl: number): string | null {
  const levels = styles.numbering.get(numId);
  if (!levels) return null;
  return levels.get(ilvl) ?? levels.get(0) ?? "decimal";
}

/** Alignement de Nano Buro d'une valeur `w:jc`, ou null pour la gauche (alignement par défaut). */
export function alignmentOf(jc: string | null): "center" | "right" | "justify" | null {
  if (jc === "center") return "center";
  if (jc === "right" || jc === "end") return "right";
  if (jc === "both" || jc === "distribute" || jc?.endsWith("Kashida")) return "justify";
  return null;
}

/** Interligne « Par défaut » de Nano Buro, tel que l'export Word l'écrit (1,65 en CSS, 330 en 240e de ligne). */
const NANO_DEFAULT_LINE = 330;

/**
 * Interligne de Nano Buro le plus proche (`"1"`, `"1.15"`, `"1.5"`, `"2"`), ou null pour « Par défaut » ou
 * un interligne fixe de Word (en points), qui n'a pas d'équivalent.
 */
export function lineHeightOf(line: number | null, lineRule: string | null): string | null {
  if (line === null || (lineRule !== null && lineRule !== "auto") || line <= 0) return null;
  if (Math.abs(line - NANO_DEFAULT_LINE) <= 2) return null;
  const value = line / 240;
  let best: string = LINE_HEIGHTS[0].value;
  for (const { value: candidate } of LINE_HEIGHTS) {
    if (Math.abs(Number(candidate) - value) < Math.abs(Number(best) - value)) best = candidate;
  }
  return best;
}

/** Niveau de retrait de Nano Buro (0 à 5, 1,25 cm chacun) d'une marge de gauche en vingtièmes de point. */
export function indentOf(left: number | null): number {
  if (left === null || left <= 0) return 0;
  return Math.min(MAX_INDENT, Math.round(left / (INDENT_STEP_CM * 567)));
}

/** Familles de Word et du web rapprochées d'EB Garamond (empattements « à l'ancienne »). */
const GARAMOND_LIKE =
  /garamond|garamon|palatino|book antiqua|baskerville|caslon|bembo|sabon|minion|jenson|goudy|bookman|centaur|cormorant|crimson/i;
/** Familles à chasse fixe, rapprochées d'IBM Plex Mono. */
const MONOSPACE =
  /mono|courier|consolas|menlo|monaco|lucida console|typewriter|andale|fixedsys|source code|inconsolata|code/i;
/** Familles à empattements, rapprochées d'IBM Plex Serif. */
const SERIF =
  /serif|times|georgia|cambria|century|constantia|didot|bodoni|perpetua|rockwell|charter|sitka|merriweather|playfair|lora|tinos|caladea|noto serif|dejavu serif|liberation serif|pt serif|droid serif|bell mt|californian|elephant|modern no|high tower|lucida bright|calisto|cooper|footlight|baskerville/i;

/**
 * Police intégrée la plus proche d'une police de Word (critère 2) : chasse fixe vers IBM Plex Mono, empattements
 * vers EB Garamond (familles à l'ancienne) ou IBM Plex Serif, sinon IBM Plex Sans. Une police déjà intégrée est
 * gardée telle quelle. Renvoie null pour la police par défaut (IBM Plex Sans), qui n'est pas écrite.
 */
export function nearestFont(font: string | undefined): string | null {
  if (!font) return null;
  const name = font.trim();
  const known = DOCUMENT_FONTS.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  let result: string = DEFAULT_FONT;
  if (known) result = known.name;
  else if (/^source sans pro$/i.test(name)) result = "Source Sans 3";
  else if (MONOSPACE.test(name)) result = "IBM Plex Mono";
  else if (/sans/i.test(name)) result = DEFAULT_FONT;
  else if (GARAMOND_LIKE.test(name)) result = "EB Garamond";
  else if (SERIF.test(name)) result = "IBM Plex Serif";
  return result === DEFAULT_FONT ? null : result;
}

/** Taille de Nano Buro (`"11pt"`) d'une taille en demi-points, ou null pour la taille par défaut (12 points). */
export function fontSizeOf(halfPoints: number | undefined): string | null {
  if (halfPoints === undefined) return null;
  const points = Math.min(400, Math.max(1, Math.round(halfPoints) / 2));
  return points === DEFAULT_FONT_SIZE ? null : `${String(points)}pt`;
}

/** Composantes d'une couleur `RRGGBB` (avec ou sans `#`), ou null. */
function rgb(color: string): [number, number, number] | null {
  const hex = color.replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  const value = Number.parseInt(hex, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Écart perçu entre deux couleurs (formule « redmean »). */
function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  const mean = (a[0] + b[0]) / 2;
  const [dr, dg, db] = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  return Math.sqrt((2 + mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean) / 256) * db * db);
}

/** Couleur la plus proche parmi `choices` (valeur null : noir, la couleur « Automatique »). */
function nearest(
  color: [number, number, number],
  choices: readonly (string | null)[],
): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const choice of choices) {
    const value = rgb(choice ?? "1B1B1A");
    if (!value) continue;
    const distance = colorDistance(color, value);
    if (distance < bestDistance) {
      best = choice;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Couleur du texte la plus proche dans la palette (critère 2), ou null pour « Automatique » : `auto`, le noir et
 * les couleurs proches du noir.
 */
export function nearestTextColor(color: string | undefined): string | null {
  const value = color && color !== "auto" ? rgb(color) : null;
  if (!value) return null;
  return nearest(
    value,
    TEXT_COLORS.map(({ value: choice }) => choice),
  );
}

/** Surlignages nommés de Word et leur couleur de la palette (choisis à l'œil, comme à l'export, T2.7). */
const WORD_HIGHLIGHTS: Record<string, string> = {
  yellow: "#FFF176",
  darkYellow: "#FFF176",
  green: "#C5E1A5",
  darkGreen: "#C5E1A5",
  cyan: "#B3E5FC",
  blue: "#B3E5FC",
  darkBlue: "#B3E5FC",
  darkCyan: "#B3E5FC",
  magenta: "#F8BBD0",
  darkMagenta: "#F8BBD0",
  red: "#F8BBD0",
  darkRed: "#F8BBD0",
};

/**
 * Surlignage de la palette le plus proche (critère 2) : un surlignage nommé de Word, ou une couleur de fond du
 * texte. null sans surlignage, ou pour un fond gris, blanc ou noir, qui n'a pas d'équivalent.
 */
export function nearestHighlight(props: RunProps): string | null {
  if (props.highlight && props.highlight !== "none") {
    return WORD_HIGHLIGHTS[props.highlight] ?? HIGHLIGHT_COLORS[1]?.value ?? null;
  }
  const value = props.shading ? rgb(props.shading) : null;
  if (!value || Math.max(...value) - Math.min(...value) < 24) return null;
  return nearest(
    value,
    HIGHLIGHT_COLORS.flatMap(({ value: choice }) => (choice ? [choice] : [])),
  );
}
