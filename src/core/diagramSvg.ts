// Schémas (T2.20, critère 8) : dessin vectoriel (SVG) d'un schéma, en texte, sans navigateur. Il sert
// à l'affichage hors modification, à l'impression et au PDF, et à l'image de l'export Word (critère 9).
import {
  anchorPoint,
  approximateMeasure,
  contentBounds,
  DIAGRAM_FONT_FAMILY,
  DIAGRAM_FONT_SIZE,
  DIAGRAM_LINE_HEIGHT,
  DIAGRAM_STROKE,
  DIAGRAM_TEXT,
  diagramDescription,
  textWidth,
  wrapText,
  type DiagramArrow,
  type DiagramData,
  type DiagramShape,
  type MeasureText,
} from "./diagram";

/** Options du dessin. */
export interface DiagramSvgOptions {
  /** Hauteur du dessin, en pixels (celle du bloc, `diagramHeight`). */
  height: number;
  /**
   * Largeur du dessin, en pixels. Sans largeur, le dessin prend la largeur du bloc (`100%`), à l'échelle
   * 1 : une forme est au même endroit qu'en modification.
   */
  width?: number;
  /** Ne dessine que le cadre des formes, avec cette marge (image Word, critère 9). */
  cropPadding?: number;
  /** Mesure des textes (canvas dans le navigateur), approchée sinon. */
  measure?: MeasureText;
  /** Préfixe des identifiants internes (pointe de flèche), unique par schéma affiché dans la page. */
  idPrefix?: string;
  /** Règles CSS ajoutées dans le dessin (police embarquée pour l'image Word). */
  style?: string;
  /** Formes et flèches surlignées par la recherche (T2.1, critère 10), par identifiant. */
  highlighted?: ReadonlySet<string>;
}

/** Épaisseur du trait des formes et des flèches. */
const STROKE_WIDTH = 1.5;

/** Rayon d'un rectangle arrondi. */
const ROUNDED_RADIUS = 14;

/** Couleur du surlignage de la recherche, celle du fond des occurrences (src/ui/styles/search.css). */
const SEARCH_FILL = "#FFF176";

/** Texte protégé pour du XML. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function round(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function shapeOutline(shape: DiagramShape, fill: string): string {
  const common = `fill="${fill}" stroke="${DIAGRAM_STROKE}" stroke-width="${STROKE_WIDTH}"`;
  const { x, y, width, height } = shape;
  switch (shape.kind) {
    case "rectangle":
      return `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" ${common}/>`;
    case "rounded": {
      const radius = Math.min(ROUNDED_RADIUS, width / 2, height / 2);
      return `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" rx="${round(radius)}" ${common}/>`;
    }
    case "circle":
      return `<ellipse cx="${round(x + width / 2)}" cy="${round(y + height / 2)}" rx="${round(width / 2)}" ry="${round(height / 2)}" ${common}/>`;
    case "diamond": {
      const points: [number, number][] = [
        [x + width / 2, y],
        [x + width, y + height / 2],
        [x + width / 2, y + height],
        [x, y + height / 2],
      ];
      return `<polygon points="${points.map(([px, py]) => `${round(px)},${round(py)}`).join(" ")}" ${common}/>`;
    }
  }
}

/** Lignes de texte centrées autour d'un point. */
function textLines(lines: readonly string[], cx: number, cy: number): string {
  if (lines.every((line) => line === "")) return "";
  const first = cy - ((lines.length - 1) * DIAGRAM_LINE_HEIGHT) / 2;
  const spans = lines
    .map(
      (line, index) =>
        `<tspan x="${round(cx)}" y="${round(first + index * DIAGRAM_LINE_HEIGHT)}">${escapeXml(line)}</tspan>`,
    )
    .join("");
  return `<text text-anchor="middle" dominant-baseline="central">${spans}</text>`;
}

/**
 * Lignes affichées du texte d'une forme, aussi dessinées par l'éditeur, pour que le texte coupe au même
 * endroit en modification et hors modification.
 */
export function shapeLines(shape: DiagramShape, measure: MeasureText): string[] {
  return wrapText(shape.text, textWidth(shape), measure);
}

function shapeSvg(shape: DiagramShape, measure: MeasureText, highlighted: boolean): string {
  const fill = highlighted ? SEARCH_FILL : (shape.fill ?? "#FFFFFF");
  return `<g data-shape-id="${escapeXml(shape.id)}">${shapeOutline(shape, fill)}${textLines(
    shapeLines(shape, measure),
    shape.x + shape.width / 2,
    shape.y + shape.height / 2,
  )}</g>`;
}

/** Milieu d'une flèche, où se place son texte. */
export function arrowMiddle(
  arrow: DiagramArrow,
  shapes: ReadonlyMap<string, DiagramShape>,
): { x: number; y: number } | null {
  const from = shapes.get(arrow.from);
  const to = shapes.get(arrow.to);
  if (!from || !to) return null;
  const start = anchorPoint(from, arrow.fromSide);
  const end = anchorPoint(to, arrow.toSide);
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
}

function arrowSvg(
  arrow: DiagramArrow,
  shapes: ReadonlyMap<string, DiagramShape>,
  marker: string,
  measure: MeasureText,
  highlighted: boolean,
): string {
  const from = shapes.get(arrow.from);
  const to = shapes.get(arrow.to);
  if (!from || !to) return "";
  const start = anchorPoint(from, arrow.fromSide);
  const end = anchorPoint(to, arrow.toSide);
  const line = `<line x1="${round(start.x)}" y1="${round(start.y)}" x2="${round(end.x)}" y2="${round(end.y)}" stroke="${DIAGRAM_STROKE}" stroke-width="${STROKE_WIDTH}" marker-end="url(#${marker})"/>`;
  const label = arrow.text.replace(/\s+/g, " ").trim();
  if (label === "") return `<g data-arrow-id="${escapeXml(arrow.id)}">${line}</g>`;
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const width = measure(label) + 10;
  const height = DIAGRAM_LINE_HEIGHT + 4;
  const background = `<rect x="${round(mx - width / 2)}" y="${round(my - height / 2)}" width="${round(width)}" height="${height}" rx="4" fill="${highlighted ? SEARCH_FILL : "#FFFFFF"}"/>`;
  return `<g data-arrow-id="${escapeXml(arrow.id)}">${line}${background}${textLines([label], mx, my)}</g>`;
}

/**
 * Dessin SVG complet d'un schéma (critère 8) : formes, textes coupés en lignes, flèches avec pointe et
 * texte. Le dessin porte un nom accessible qui liste les textes (critère 13). Les textes sont protégés :
 * un texte venu d'un fichier ne peut pas ajouter d'élément au dessin.
 */
export function diagramToSvg(data: DiagramData, options: DiagramSvgOptions): string {
  const measure = options.measure ?? approximateMeasure;
  const marker = `${options.idPrefix ?? "nano-diagram"}-arrow`;
  const shapes = new Map(data.shapes.map((shape) => [shape.id, shape]));
  const highlighted = options.highlighted ?? new Set<string>();
  let viewBox = "";
  let width = options.width === undefined ? "100%" : round(options.width);
  let height = round(options.height);
  if (options.cropPadding !== undefined) {
    const bounds = contentBounds(data) ?? { x: 0, y: 0, width: 0, height: 0 };
    const padding = options.cropPadding;
    const boxWidth = bounds.width + padding * 2;
    const boxHeight = bounds.height + padding * 2;
    viewBox = ` viewBox="${round(bounds.x - padding)} ${round(bounds.y - padding)} ${round(boxWidth)} ${round(boxHeight)}"`;
    width = round(options.width ?? boxWidth);
    height = round(((options.width ?? boxWidth) * boxHeight) / boxWidth);
  }
  const label = escapeXml(diagramDescription(data));
  const style = options.style ? `<style>${options.style}</style>` : "";
  const defs = `<defs>${style}<marker id="${marker}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${DIAGRAM_STROKE}"/></marker></defs>`;
  const body = [
    ...data.arrows.map((arrow) =>
      arrowSvg(arrow, shapes, marker, measure, highlighted.has(arrow.id)),
    ),
    ...data.shapes.map((shape) => shapeSvg(shape, measure, highlighted.has(shape.id))),
  ].join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}" width="${width}" height="${height}"${viewBox}` +
    ` font-family="'${DIAGRAM_FONT_FAMILY}', sans-serif" font-size="${DIAGRAM_FONT_SIZE}" fill="${DIAGRAM_TEXT}">` +
    `<title>${label}</title>${defs}${body}</svg>`
  );
}
