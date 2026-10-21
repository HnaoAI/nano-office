// Conversion des blocs d'un document Nano Buro (JSON de Tiptap) en éléments de la bibliothèque `docx`
// (MIT), pour l'export Word (T2.7) : paragraphes, titres, listes, tableaux, images et texte mis en forme.
// Logique pure, sans navigateur ; le document Word complet est assemblé par wordExport.ts.
import {
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  HighlightColor,
  ImageRun,
  LineRuleType,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
  type IRunOptions,
} from "docx";
import { cssLineHeight } from "./lineHeight";
import { DOCUMENT_FONTS, fontSizePoints } from "./textStyle";
import type { DocumentJson } from "./types";

/** Image prête pour Word : PNG, JPEG ou GIF (un WebP est converti avant), avec ses dimensions en pixels. */
export interface WordImage {
  type: "png" | "jpg" | "gif";
  data: Uint8Array;
  width: number;
  height: number;
}

/** Références des listes, définies dans `numbering` de wordExport.ts. */
export const BULLET_LIST = "nano-bullet";
export const ORDERED_LIST = "nano-ordered";

/** Retrait d'un niveau de liste, en vingtièmes de point (0,25 pouce, celui de Word). */
export const LIST_INDENT = 360;

/** Espace après un paragraphe, en vingtièmes de point : les 16 px (12 pt) de la charte. */
const PARAGRAPH_AFTER = 240;

/** Espace après un élément de liste ou un paragraphe de cellule : 6 px (4,5 pt), comme à l'écran. */
const SMALL_AFTER = 90;

/** Interligne « Par défaut » de l'éditeur (1,65 en CSS), exprimé à la façon de Word (T2.2). */
const DEFAULT_WORD_LINE = 1.65 / 1.2;

/** Bordure des tableaux : trait fin du séparateur fort de la charte (T1.8). */
const TABLE_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "D4D4D1" };

/** Contexte d'une conversion : images du document, largeur du texte, compteur des listes numérotées. */
export interface BlockContext {
  images: ReadonlyMap<string, WordImage>;
  /** Largeur de la zone de texte de la page, en pixels (96 par pouce). */
  textWidthPx: number;
  /** Numéro de la prochaine liste : chaque liste repart de 1. */
  nextListInstance: number;
}

/** Ce qu'une conversion ajoute au corps du document ou d'une cellule. */
export type WordBlock = Paragraph | Table;

/** Mise en forme héritée par les blocs d'une cellule d'en-tête. */
interface BlockStyle {
  bold?: boolean;
  after?: number;
  list?: { reference: string; level: number; instance?: number };
}

const ALIGNMENTS = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
} as const;

/** Couleur `#RRGGBB` en composantes, ou null. */
function rgb(color: unknown): [number, number, number] | null {
  if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) return null;
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Couleur sans `#`, pour Word, ou undefined si ce n'est pas une couleur `#RRGGBB`. */
function wordColor(color: unknown): string | undefined {
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

/** Options d'un morceau de texte d'après ses marques. Une police inconnue garde la police par défaut. */
function runOptions(node: DocumentJson, style: BlockStyle): IRunOptions {
  const options: { -readonly [K in keyof IRunOptions]: IRunOptions[K] } = { text: node.text ?? "" };
  if (style.bold) options.bold = true;
  for (const mark of node.marks ?? []) {
    const attrs = mark.attrs ?? {};
    if (mark.type === "bold") options.bold = true;
    if (mark.type === "italic") options.italics = true;
    if (mark.type === "strike") options.strike = true;
    if (mark.type === "highlight") options.highlight = nearestHighlight(attrs.color);
    if (mark.type === "textStyle") {
      const font = DOCUMENT_FONTS.find(({ name }) => name === attrs.fontFamily);
      if (font) options.font = font.name;
      const points = fontSizePoints(attrs.fontSize);
      if (points !== null) options.size = Math.round(points * 2);
      const color = wordColor(attrs.color);
      if (color) options.color = color;
    }
  }
  return options;
}

/** Interligne d'un bloc (T2.2), en 240e de ligne, comme Word ; « Par défaut » vaut celui de l'éditeur. */
function lineSpacing(node: DocumentJson): number | undefined {
  if (node.type === "heading" && node.attrs?.lineHeight == null) return undefined;
  const css = cssLineHeight(node.attrs?.lineHeight);
  const word = css === null ? DEFAULT_WORD_LINE : Number(node.attrs?.lineHeight);
  return Math.round(word * 240);
}

/** Paragraphe ou titre. */
function textBlock(node: DocumentJson, style: BlockStyle): Paragraph {
  const align = node.attrs?.textAlign as keyof typeof ALIGNMENTS | undefined;
  const line = lineSpacing(node);
  const options: { -readonly [K in keyof IParagraphOptions]: IParagraphOptions[K] } = {
    children: (node.content ?? []).map((child) => new TextRun(runOptions(child, style))),
  };
  if (align && align in ALIGNMENTS) options.alignment = ALIGNMENTS[align];
  if (node.type === "heading") {
    const level = Number(node.attrs?.level);
    options.heading =
      level === 1
        ? HeadingLevel.HEADING_1
        : level === 2
          ? HeadingLevel.HEADING_2
          : HeadingLevel.HEADING_3;
  }
  if (line !== undefined || style.after !== undefined) {
    options.spacing = {
      ...(line !== undefined ? { line, lineRule: LineRuleType.AUTO } : {}),
      ...(style.after !== undefined && node.type !== "heading" ? { after: style.after } : {}),
    };
  }
  if (style.list) {
    options.numbering = style.list;
  }
  return new Paragraph(options);
}

/** Image : sa taille choisie, ou sa taille réelle, au plus la largeur du texte ; « Image manquante » sinon. */
function imageBlock(node: DocumentJson, context: BlockContext): Paragraph {
  const align = node.attrs?.textAlign as keyof typeof ALIGNMENTS | undefined;
  const alignment = align && align in ALIGNMENTS ? ALIGNMENTS[align] : undefined;
  const image = context.images.get(String(node.attrs?.hash));
  if (!image) {
    return new Paragraph({
      alignment,
      spacing: { after: PARAGRAPH_AFTER },
      children: [new TextRun({ text: "Image manquante", italics: true, color: "5F5F5C" })],
    });
  }
  const chosen = Number(node.attrs?.width);
  const width = Math.min(
    Number.isFinite(chosen) && chosen > 0 ? chosen : image.width,
    context.textWidthPx,
  );
  const height = (image.height * width) / image.width;
  const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
  return new Paragraph({
    alignment,
    spacing: { after: PARAGRAPH_AFTER },
    children: [
      new ImageRun({
        type: image.type,
        data: image.data,
        transformation: { width: Math.round(width), height: Math.round(height) },
        altText: { name: alt || "Image", description: alt, title: alt },
      }),
    ],
  });
}

/** Liste à puces ou numérotée, avec ses niveaux imbriqués (T1.2). */
function listBlocks(
  node: DocumentJson,
  context: BlockContext,
  style: BlockStyle,
  level: number,
): WordBlock[] {
  const ordered = node.type === "orderedList";
  // Chaque liste, imbriquée ou non, a sa propre numérotation : elle repart de 1, comme à l'écran.
  const instance = context.nextListInstance++;
  const reference = ordered ? ORDERED_LIST : BULLET_LIST;
  const blocks: WordBlock[] = [];
  for (const item of node.content ?? []) {
    (item.content ?? []).forEach((child, index) => {
      if (child.type === "bulletList" || child.type === "orderedList") {
        blocks.push(...listBlocks(child, context, style, level + 1));
        return;
      }
      const list = { reference, level: Math.min(level, 2), instance };
      // Le premier paragraphe porte la puce ou le numéro ; les suivants sont alignés sur son texte.
      blocks.push(
        index === 0
          ? textBlock(child, { ...style, after: SMALL_AFTER, list })
          : withIndent(child, style, level),
      );
    });
  }
  return blocks;
}

/** Paragraphe d'un élément de liste, sans puce, aligné sur le texte de l'élément. */
function withIndent(node: DocumentJson, style: BlockStyle, level: number): Paragraph {
  return new Paragraph({
    children: (node.content ?? []).map((child) => new TextRun(runOptions(child, style))),
    indent: { left: LIST_INDENT * (level + 1) },
    spacing: { after: SMALL_AFTER },
  });
}

/** Tableau : toute la largeur, colonnes égales, bordures fines, ligne d'en-tête répétée (T1.8). */
function tableBlock(node: DocumentJson, context: BlockContext): Table {
  const rows = node.content ?? [];
  const columns = Math.max(1, ...rows.map((row) => row.content?.length ?? 0));
  const widthTwips = Math.round(context.textWidthPx * 15);
  const cellWidth = Math.floor(widthTwips / columns);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: Array.from({ length: columns }, () => cellWidth),
    borders: {
      top: TABLE_BORDER,
      bottom: TABLE_BORDER,
      left: TABLE_BORDER,
      right: TABLE_BORDER,
      insideHorizontal: TABLE_BORDER,
      insideVertical: TABLE_BORDER,
    },
    rows: rows.map((row, rowIndex) => {
      const cells = row.content ?? [];
      const header =
        rowIndex === 0 && cells.length > 0 && cells.every((cell) => cell.type === "tableHeader");
      return new TableRow({
        tableHeader: header,
        cantSplit: true,
        children: cells.map((cell) => {
          const bold = cell.type === "tableHeader";
          const blocks = cell.content ?? [];
          // Pas d'espace sous le dernier bloc d'une cellule, comme à l'écran.
          const children = blocks.flatMap((block, index) =>
            convertBlock(block, context, {
              bold,
              after: index < blocks.length - 1 ? SMALL_AFTER : 0,
            }),
          );
          return new TableCell({
            width: { size: cellWidth, type: WidthType.DXA },
            margins: { top: 90, bottom: 90, left: 150, right: 150 },
            // Une cellule Word contient toujours au moins un paragraphe.
            children: children.length > 0 ? children : [new Paragraph({})],
          });
        }),
      });
    }),
  });
}

/**
 * Convertit un bloc du document en éléments Word. Un bloc inconnu (version future) donne son texte
 * brut, pour que rien ne se perde en silence.
 * @param style mise en forme héritée (en-tête de tableau, espace après)
 */
export function convertBlock(
  node: DocumentJson,
  context: BlockContext,
  style: BlockStyle = { after: PARAGRAPH_AFTER },
): WordBlock[] {
  switch (node.type) {
    case "paragraph":
    case "heading":
      return [textBlock(node, style)];
    case "bulletList":
    case "orderedList":
      return listBlocks(node, context, style, 0);
    case "table":
      return [tableBlock(node, context)];
    case "image":
      return [imageBlock(node, context)];
    default:
      return [new Paragraph({ children: [new TextRun({ text: plainText(node) })] })];
  }
}

/** Texte brut d'un nœud. */
function plainText(node: DocumentJson): string {
  return node.text ?? (node.content ?? []).map(plainText).join(" ");
}
