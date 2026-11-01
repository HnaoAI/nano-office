// Schémas (T2.20) : données d'un schéma (formes, flèches), lues sans confiance depuis le document, et
// géométrie partagée par l'affichage SVG (diagramSvg.ts), l'éditeur React Flow et l'export Word.
// Logique pure, sans navigateur ni React.
import { HIGHLIGHT_COLORS, sameColor } from "./documentColors";

/** Formes proposées (critère 2). */
export const DIAGRAM_SHAPE_KINDS = ["rectangle", "rounded", "circle", "diamond"] as const;

/** Type d'une forme. */
export type DiagramShapeKind = (typeof DIAGRAM_SHAPE_KINDS)[number];

/** Noms affichés des formes, dans la petite barre du schéma. */
export const DIAGRAM_SHAPE_NAMES: Record<DiagramShapeKind, string> = {
  rectangle: "Rectangle",
  rounded: "Rectangle arrondi",
  circle: "Cercle",
  diamond: "Losange",
};

/** Côtés d'une forme où s'accroche une flèche (critère 3). */
export const DIAGRAM_SIDES = ["top", "right", "bottom", "left"] as const;

/** Côté d'une forme. */
export type DiagramSide = (typeof DIAGRAM_SIDES)[number];

/**
 * Une forme du schéma, en pixels CSS (96 par pouce) depuis le coin haut gauche du schéma.
 * `fill` vaut null pour le fond blanc par défaut, sinon une couleur de surlignage (critère 5).
 */
export interface DiagramShape {
  id: string;
  kind: DiagramShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fill: string | null;
}

/** Une flèche, d'un côté d'une forme à un côté d'une autre, avec un texte facultatif (« oui »). */
export interface DiagramArrow {
  id: string;
  from: string;
  fromSide: DiagramSide;
  to: string;
  toSide: DiagramSide;
  text: string;
}

/** Contenu d'un schéma : ses formes et ses flèches. */
export interface DiagramData {
  shapes: DiagramShape[];
  arrows: DiagramArrow[];
}

/** Pas de la grille magnétique (critère 4), en pixels. */
export const DIAGRAM_GRID = 10;

/** Hauteur d'un schéma vide, et hauteur minimale d'un schéma. */
export const DIAGRAM_MIN_HEIGHT = 160;

/** Marge laissée sous la forme la plus basse. */
export const DIAGRAM_BOTTOM_PADDING = 20;

/** Hauteur maximale enregistrée, pour qu'un fichier modifié à la main ne crée pas un bloc démesuré. */
export const DIAGRAM_MAX_HEIGHT = 4000;

/** Taille d'une forme ajoutée, par type. */
export const DIAGRAM_DEFAULT_SIZES: Record<DiagramShapeKind, { width: number; height: number }> = {
  rectangle: { width: 160, height: 60 },
  rounded: { width: 160, height: 60 },
  circle: { width: 100, height: 100 },
  diamond: { width: 140, height: 100 },
};

/** Taille minimale d'une forme. */
export const DIAGRAM_MIN_SHAPE = 30;

/** Plus grande coordonnée acceptée, pour qu'un fichier modifié à la main reste affichable. */
const MAX_COORDINATE = 20_000;

/** Nombre de formes et de flèches au-delà duquel le reste d'un fichier est ignoré. */
const MAX_ITEMS = 2000;

/** Longueur maximale d'un texte de forme ou de flèche. */
const MAX_TEXT = 2000;

/** Police des textes des formes (critère 5), et sa taille en pixels. */
export const DIAGRAM_FONT_FAMILY = "IBM Plex Sans";
export const DIAGRAM_FONT_SIZE = 14;

/** Hauteur d'une ligne de texte dans une forme, en pixels. */
export const DIAGRAM_LINE_HEIGHT = 18;

/** Couleurs du trait et du texte : noir de l'encre, dans le style monochrome de la charte (critère 5). */
export const DIAGRAM_STROKE = "#121212";
export const DIAGRAM_TEXT = "#1B1B1A";

/** Schéma vide. */
export const EMPTY_DIAGRAM: DiagramData = { shapes: [], arrows: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_TEXT) : "";
}

/**
 * Couleur de fond acceptée : une couleur de surlignage de la palette (T1.7), sinon null (fond blanc).
 * Une autre valeur venue d'un fichier ne doit pas pouvoir ajouter du CSS ou du SVG.
 */
export function diagramFill(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const color = HIGHLIGHT_COLORS.find((entry) => sameColor(entry.value, value));
  return color?.value ?? null;
}

function isSide(value: unknown): value is DiagramSide {
  return (DIAGRAM_SIDES as readonly unknown[]).includes(value);
}

function isKind(value: unknown): value is DiagramShapeKind {
  return (DIAGRAM_SHAPE_KINDS as readonly unknown[]).includes(value);
}

/**
 * Formes et flèches d'un bloc Schéma, relues sans confiance (fichier modifié à la main) : une forme
 * sans identifiant ou d'un type inconnu est ignorée, une valeur hors bornes est ramenée dans les bornes,
 * une flèche dont une extrémité manque est ignorée. Ne lève jamais d'erreur.
 * @param attrs attributs du nœud `diagram` (`shapes`, `arrows`)
 */
export function readDiagram(attrs: Record<string, unknown> | null | undefined): DiagramData {
  const shapes: DiagramShape[] = [];
  const ids = new Set<string>();
  const rawShapes: unknown[] = Array.isArray(attrs?.shapes) ? attrs.shapes : [];
  for (const raw of rawShapes.slice(0, MAX_ITEMS)) {
    if (!isRecord(raw) || typeof raw.id !== "string" || raw.id === "" || ids.has(raw.id)) continue;
    if (!isKind(raw.kind)) continue;
    const size = DIAGRAM_DEFAULT_SIZES[raw.kind];
    ids.add(raw.id);
    shapes.push({
      id: raw.id,
      kind: raw.kind,
      x: finite(raw.x, 0, 0, MAX_COORDINATE),
      y: finite(raw.y, 0, 0, MAX_COORDINATE),
      width: finite(raw.width, size.width, DIAGRAM_MIN_SHAPE, MAX_COORDINATE),
      height: finite(raw.height, size.height, DIAGRAM_MIN_SHAPE, MAX_COORDINATE),
      text: text(raw.text),
      fill: diagramFill(raw.fill),
    });
  }
  const arrows: DiagramArrow[] = [];
  const arrowIds = new Set<string>();
  const rawArrows: unknown[] = Array.isArray(attrs?.arrows) ? attrs.arrows : [];
  for (const raw of rawArrows.slice(0, MAX_ITEMS)) {
    if (!isRecord(raw) || typeof raw.id !== "string" || raw.id === "" || arrowIds.has(raw.id)) {
      continue;
    }
    if (typeof raw.from !== "string" || typeof raw.to !== "string") continue;
    if (!ids.has(raw.from) || !ids.has(raw.to)) continue;
    arrowIds.add(raw.id);
    arrows.push({
      id: raw.id,
      from: raw.from,
      fromSide: isSide(raw.fromSide) ? raw.fromSide : "bottom",
      to: raw.to,
      toSide: isSide(raw.toSide) ? raw.toSide : "top",
      text: text(raw.text),
    });
  }
  return { shapes, arrows };
}

/** Attributs du nœud `diagram` pour des données (copies, pour que le document ne partage rien). */
export function diagramAttrs(data: DiagramData): {
  shapes: DiagramShape[];
  arrows: DiagramArrow[];
} {
  return {
    shapes: data.shapes.map((shape) => ({ ...shape })),
    arrows: data.arrows.map((arrow) => ({ ...arrow })),
  };
}

/** Bas de la forme la plus basse, ou 0 sans forme. */
export function contentBottom(data: DiagramData): number {
  return data.shapes.reduce((bottom, shape) => Math.max(bottom, shape.y + shape.height), 0);
}

/**
 * Hauteur affichée d'un schéma (critère 6) : celle choisie à la poignée du bas, mais jamais moins que
 * son contenu (la hauteur suit les formes) ni que la hauteur minimale.
 */
export function diagramHeight(data: DiagramData, chosen: unknown): number {
  const stored = finite(chosen, 0, 0, DIAGRAM_MAX_HEIGHT);
  return Math.max(DIAGRAM_MIN_HEIGHT, stored, contentBottom(data) + DIAGRAM_BOTTOM_PADDING);
}

/** Hauteur choisie relue d'un attribut : un nombre dans les bornes, ou null. */
export function chosenHeight(value: unknown): number | null {
  const height = finite(value, Number.NaN, DIAGRAM_MIN_HEIGHT, DIAGRAM_MAX_HEIGHT);
  return Number.isNaN(height) ? null : Math.round(height);
}

/** Valeur ramenée sur la grille magnétique (critère 4). */
export function snap(value: number): number {
  return Math.round(value / DIAGRAM_GRID) * DIAGRAM_GRID;
}

/** Point d'accroche d'un côté d'une forme : le milieu du côté (le sommet pour un losange). */
export function anchorPoint(shape: DiagramShape, side: DiagramSide): { x: number; y: number } {
  switch (side) {
    case "top":
      return { x: shape.x + shape.width / 2, y: shape.y };
    case "right":
      return { x: shape.x + shape.width, y: shape.y + shape.height / 2 };
    case "bottom":
      return { x: shape.x + shape.width / 2, y: shape.y + shape.height };
    case "left":
      return { x: shape.x, y: shape.y + shape.height / 2 };
  }
}

/** Mesure de la largeur d'un texte, en pixels, à la taille des formes. */
export type MeasureText = (text: string) => number;

/**
 * Mesure approchée (largeur moyenne d'un caractère d'IBM Plex Sans à 14 px), quand le navigateur ne
 * peut pas mesurer (tests) : l'éditeur passe une mesure exacte par un canvas.
 */
export const approximateMeasure: MeasureText = (value) => [...value].length * 7.4;

/** Largeur disponible pour le texte dans une forme : un losange et un cercle en laissent moins. */
export function textWidth(shape: Pick<DiagramShape, "kind" | "width">): number {
  const factor = shape.kind === "diamond" ? 0.6 : shape.kind === "circle" ? 0.75 : 1;
  return Math.max(10, shape.width * factor - 16);
}

/**
 * Lignes affichées d'un texte de forme : coupé aux retours à la ligne tapés (critère 2), puis entre les
 * mots pour tenir dans `width`. Un mot plus long que la largeur est coupé entre deux caractères.
 */
export function wrapText(value: string, width: number, measure: MeasureText): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split(/\r\n|\r|\n/)) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line === "" ? word : `${line} ${word}`;
      if (measure(candidate) <= width || line === "") {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
      // Mot trop long seul sur sa ligne : coupé entre deux caractères.
      while (measure(line) > width && [...line].length > 1) {
        const chars = [...line];
        let cut = chars.length - 1;
        while (cut > 1 && measure(chars.slice(0, cut).join("")) > width) cut -= 1;
        lines.push(chars.slice(0, cut).join(""));
        line = chars.slice(cut).join("");
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Textes des formes puis des flèches, non vides, dans l'ordre : texte de remplacement de l'image Word
 * (critère 9) et nom accessible du schéma (critère 13).
 */
export function diagramTexts(data: DiagramData): string[] {
  return [...data.shapes.map((shape) => shape.text), ...data.arrows.map((arrow) => arrow.text)]
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value !== "");
}

/** Texte de remplacement d'un schéma (critère 9) : « Schéma : Commande, Paiement, Livraison ». */
export function diagramDescription(data: DiagramData): string {
  const texts = diagramTexts(data);
  return texts.length === 0 ? "Schéma vide" : `Schéma : ${texts.join(", ")}`;
}

/** Cadre qui contient toutes les formes, ou null sans forme (image Word, critère 9). */
export function contentBounds(
  data: DiagramData,
): { x: number; y: number; width: number; height: number } | null {
  if (data.shapes.length === 0) return null;
  const left = Math.min(...data.shapes.map((shape) => shape.x));
  const top = Math.min(...data.shapes.map((shape) => shape.y));
  const right = Math.max(...data.shapes.map((shape) => shape.x + shape.width));
  const bottom = Math.max(...data.shapes.map((shape) => shape.y + shape.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
