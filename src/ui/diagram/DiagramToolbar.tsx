// Petite barre d'un schéma en modification (T2.20) : les quatre formes (critère 2), le fond des formes
// choisies dans les couleurs de surlignage (critère 5), Supprimer, et « Terminer » qui revient au texte
// (critère 1). Style de la barre de mise en forme (src/ui/styles/diagram.css).
import {
  DIAGRAM_SHAPE_KINDS,
  DIAGRAM_SHAPE_NAMES,
  type DiagramShape,
  type DiagramShapeKind,
} from "../../core/diagram";
import { HIGHLIGHT_COLORS, sameColor } from "../../core/documentColors";
import { ShapeIcon, TrashIcon } from "./diagramIcons";

/** Fond commun des formes choisies, `undefined` si elles en ont plusieurs ou s'il n'y en a pas. */
function commonFill(shapes: readonly DiagramShape[]): string | null | undefined {
  const first = shapes[0];
  if (!first) return undefined;
  return shapes.every((shape) => sameColor(shape.fill, first.fill)) ? first.fill : undefined;
}

/** Barre des formes et des couleurs d'un schéma en modification. */
export function DiagramToolbar({
  onAdd,
  onFill,
  onDelete,
  onClose,
  selected,
  canDelete,
}: {
  onAdd: (kind: DiagramShapeKind) => void;
  onFill: (fill: string | null) => void;
  onDelete: () => void;
  onClose: () => void;
  selected: readonly DiagramShape[];
  canDelete: boolean;
}) {
  const fill = commonFill(selected);
  return (
    <div className="nano-format-bar nano-diagram-bar" role="toolbar" aria-label="Schéma">
      {DIAGRAM_SHAPE_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          aria-label={`Ajouter : ${DIAGRAM_SHAPE_NAMES[kind]}`}
          title={`${DIAGRAM_SHAPE_NAMES[kind]} : un clic l'ajoute, un double clic sur la forme pour écrire`}
          onClick={() => onAdd(kind)}
        >
          <ShapeIcon kind={kind} />
        </button>
      ))}
      <div className="nano-separator" aria-hidden="true" />
      <div className="nano-swatches" role="group" aria-label="Fond des formes">
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color.name}
            type="button"
            className={color.value === null ? "nano-swatch nano-swatch-none" : "nano-swatch"}
            style={color.value === null ? undefined : { background: color.value }}
            aria-label={color.value === null ? "Fond blanc" : `Fond ${color.name.toLowerCase()}`}
            aria-pressed={fill !== undefined && sameColor(fill, color.value)}
            disabled={selected.length === 0}
            onClick={() => onFill(color.value)}
          />
        ))}
      </div>
      <div className="nano-separator" aria-hidden="true" />
      <button
        type="button"
        aria-label="Supprimer la sélection"
        title="Supprimer les formes et les flèches choisies (Suppr)"
        disabled={!canDelete}
        onClick={onDelete}
      >
        <TrashIcon />
      </button>
      <button
        type="button"
        className="nano-diagram-done"
        title="Revenir au texte (Échap)"
        onClick={onClose}
      >
        Terminer
      </button>
    </div>
  );
}
