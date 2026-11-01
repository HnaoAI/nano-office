// Schémas (T2.20) : actions de l'éditeur de formes sur les données d'un schéma (ajouter une forme, relier,
// déplacer, écrire, colorer, supprimer, copier et coller). Logique pure : chaque action renvoie de
// nouvelles données, que l'éditeur enregistre dans le document en une étape d'annulation (critère 4).
import {
  contentBottom,
  DIAGRAM_DEFAULT_SIZES,
  DIAGRAM_GRID,
  diagramFill,
  snap,
  type DiagramArrow,
  type DiagramData,
  type DiagramShape,
  type DiagramShapeKind,
  type DiagramSide,
} from "./diagram";

/** Écart entre deux formes ajoutées l'une après l'autre, en pixels. */
const SHAPE_GAP = 40;

/** Marge laissée en haut et à gauche du schéma. */
const ORIGIN = 20;

/** Décalage d'un collage, pour qu'une copie ne cache pas l'original. */
const PASTE_OFFSET = 2 * DIAGRAM_GRID;

/** Fabrique d'identifiants, fournie par l'appelant (aléatoire dans l'application, prévisible en test). */
export type NewId = () => string;

/**
 * Ajoute une forme (critère 2) à droite de la dernière forme ajoutée, ou sous les formes quand la ligne
 * est pleine, sur la grille magnétique.
 * @param areaWidth largeur du schéma, en pixels
 */
export function addShape(
  data: DiagramData,
  kind: DiagramShapeKind,
  areaWidth: number,
  newId: NewId,
): { data: DiagramData; id: string } {
  const size = DIAGRAM_DEFAULT_SIZES[kind];
  const last = data.shapes[data.shapes.length - 1];
  let x = ORIGIN;
  let y = ORIGIN;
  if (last) {
    x = snap(last.x + last.width + SHAPE_GAP);
    y = last.y;
    if (x + size.width > areaWidth) {
      x = ORIGIN;
      y = snap(contentBottom(data) + SHAPE_GAP);
    }
  }
  const id = newId();
  const shape: DiagramShape = { id, kind, x, y, ...size, text: "", fill: null };
  return { data: { ...data, shapes: [...data.shapes, shape] }, id };
}

/**
 * Relie deux formes par une flèche (critère 3). Une flèche d'une forme vers elle-même, ou qui double une
 * flèche existante entre les mêmes côtés, n'est pas ajoutée.
 */
export function connect(
  data: DiagramData,
  connection: { from: string; fromSide: DiagramSide; to: string; toSide: DiagramSide },
  newId: NewId,
): DiagramData {
  const ids = new Set(data.shapes.map((shape) => shape.id));
  if (connection.from === connection.to || !ids.has(connection.from) || !ids.has(connection.to)) {
    return data;
  }
  const duplicate = data.arrows.some(
    (arrow) =>
      arrow.from === connection.from &&
      arrow.to === connection.to &&
      arrow.fromSide === connection.fromSide &&
      arrow.toSide === connection.toSide,
  );
  if (duplicate) return data;
  const arrow: DiagramArrow = { id: newId(), ...connection, text: "" };
  return { ...data, arrows: [...data.arrows, arrow] };
}

/** Change la position et la taille de formes (déplacement, poignées), ramenées à des valeurs positives. */
export function placeShapes(
  data: DiagramData,
  changes: ReadonlyMap<string, Partial<Pick<DiagramShape, "x" | "y" | "width" | "height">>>,
): DiagramData {
  if (changes.size === 0) return data;
  return {
    ...data,
    shapes: data.shapes.map((shape) => {
      const change = changes.get(shape.id);
      if (!change) return shape;
      return {
        ...shape,
        x: Math.max(0, Math.round(change.x ?? shape.x)),
        y: Math.max(0, Math.round(change.y ?? shape.y)),
        width: Math.max(1, Math.round(change.width ?? shape.width)),
        height: Math.max(1, Math.round(change.height ?? shape.height)),
      };
    }),
  };
}

/** Change le texte d'une forme (critère 2) ou d'une flèche (critère 3). */
export function setText(data: DiagramData, id: string, text: string): DiagramData {
  return {
    shapes: data.shapes.map((shape) => (shape.id === id ? { ...shape, text } : shape)),
    arrows: data.arrows.map((arrow) => (arrow.id === id ? { ...arrow, text } : arrow)),
  };
}

/** Fond des formes `ids` (critère 5) : une couleur de surlignage, ou null pour le fond blanc. */
export function setFill(
  data: DiagramData,
  ids: ReadonlySet<string>,
  fill: string | null,
): DiagramData {
  const value = diagramFill(fill);
  return {
    ...data,
    shapes: data.shapes.map((shape) => (ids.has(shape.id) ? { ...shape, fill: value } : shape)),
  };
}

/**
 * Supprime des formes et des flèches (Suppr, critères 3 et 4). Les flèches d'une forme supprimée
 * disparaissent avec elle.
 */
export function removeItems(
  data: DiagramData,
  shapeIds: ReadonlySet<string>,
  arrowIds: ReadonlySet<string>,
): DiagramData {
  return {
    shapes: data.shapes.filter((shape) => !shapeIds.has(shape.id)),
    arrows: data.arrows.filter(
      (arrow) => !arrowIds.has(arrow.id) && !shapeIds.has(arrow.from) && !shapeIds.has(arrow.to),
    ),
  };
}

/** Formes copiées et flèches qui les relient entre elles (critère 4). */
export function copyItems(data: DiagramData, shapeIds: ReadonlySet<string>): DiagramData {
  const shapes = data.shapes.filter((shape) => shapeIds.has(shape.id));
  const arrows = data.arrows.filter((arrow) => shapeIds.has(arrow.from) && shapeIds.has(arrow.to));
  return { shapes, arrows };
}

/**
 * Colle des formes copiées (critère 4), décalées, avec de nouveaux identifiants, et les flèches qui les
 * relient entre elles.
 * @returns les données et les identifiants des formes collées, à sélectionner
 */
export function pasteItems(
  data: DiagramData,
  copied: DiagramData,
  newId: NewId,
): { data: DiagramData; ids: string[] } {
  const ids = new Map<string, string>();
  const shapes = copied.shapes.map((shape) => {
    const id = newId();
    ids.set(shape.id, id);
    return { ...shape, id, x: shape.x + PASTE_OFFSET, y: shape.y + PASTE_OFFSET };
  });
  const arrows = copied.arrows.flatMap((arrow) => {
    const from = ids.get(arrow.from);
    const to = ids.get(arrow.to);
    return from && to ? [{ ...arrow, id: newId(), from, to }] : [];
  });
  return {
    data: { shapes: [...data.shapes, ...shapes], arrows: [...data.arrows, ...arrows] },
    ids: shapes.map((shape) => shape.id),
  };
}
