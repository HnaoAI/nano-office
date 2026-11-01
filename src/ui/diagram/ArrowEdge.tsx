// Flèche de l'éditeur de schémas (T2.20, critère 3) : un trait droit du point d'accroche d'une forme à
// celui d'une autre, calculé comme le dessin hors modification, qui suit les formes déplacées, avec
// son texte (« oui », « non ») saisi au double clic.
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import { useContext } from "react";
import { anchorPoint, DIAGRAM_STROKE, type DiagramSide } from "../../core/diagram";
import { DiagramContext } from "./diagramContext";
import { TextField } from "./ShapeNode";

/** Identifiant de la pointe, définie une fois par ArrowMarker (un seul schéma est ouvert à la fois). */
const MARKER_ID = "nano-diagram-edit-arrow";

type ArrowData = { text: string; fromSide: DiagramSide; toSide: DiagramSide };

/** Flèche du schéma, affichée par React Flow. */
export function ArrowEdge({ id, source, target, data, selected }: EdgeProps) {
  const { shapes, editingText } = useContext(DiagramContext);
  const arrow = data as ArrowData | undefined;
  const from = shapes.get(source);
  const to = shapes.get(target);
  if (!from || !to || !arrow) return null;
  const start = anchorPoint(from, arrow.fromSide);
  const end = anchorPoint(to, arrow.toSide);
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const text = arrow.text.replace(/\s+/g, " ").trim();
  const editing = editingText === id;
  return (
    <>
      <BaseEdge
        id={id}
        path={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
        markerEnd={`url(#${MARKER_ID})`}
        className={
          selected ? "nano-diagram-arrow nano-diagram-arrow-selected" : "nano-diagram-arrow"
        }
        interactionWidth={16}
      />
      {(text !== "" || editing) && (
        <EdgeLabelRenderer>
          <div
            className="nano-diagram-arrow-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${middle.x}px, ${middle.y}px)` }}
          >
            {editing ? (
              <TextField
                id={id}
                initial={arrow.text}
                label="Texte de la flèche"
                multiline={false}
              />
            ) : (
              text
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/** Définition SVG de la pointe des flèches, la même que celle du dessin hors modification. */
export function ArrowMarker() {
  return (
    <svg className="nano-diagram-marker-defs" aria-hidden="true" width="0" height="0">
      <defs>
        <marker
          id={MARKER_ID}
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="10"
          markerHeight="10"
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill={DIAGRAM_STROKE} />
        </marker>
      </defs>
    </svg>
  );
}
