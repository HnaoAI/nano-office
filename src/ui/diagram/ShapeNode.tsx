// Forme de l'éditeur de schémas (T2.20) : son dessin (le même que hors modification), ses quatre points
// d'accroche pour tirer une flèche (critère 3), ses poignées de taille, et la saisie de son texte sur
// plusieurs lignes au double clic ou à Entrée (critère 2).
import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { useContext, useState, type KeyboardEvent } from "react";
import { DIAGRAM_MIN_SHAPE, type DiagramShape } from "../../core/diagram";
import { shapeSvg } from "../../core/diagramSvg";
import { DiagramContext } from "./diagramContext";

/** Données d'une forme dans React Flow. */
export type ShapeNodeData = { shape: DiagramShape };

const HANDLES = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
] as const;

/** Champ de saisie du texte d'une forme : Entrée passe à la ligne, Échap ou un clic à côté termine. */
export function TextField({
  id,
  initial,
  label,
  multiline,
}: {
  id: string;
  initial: string;
  label: string;
  multiline: boolean;
}) {
  const { finishText } = useContext(DiagramContext);
  const [value, setValue] = useState(initial);
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Escape" || (!multiline && event.key === "Enter")) {
      event.preventDefault();
      finishText(id, value);
    }
  };
  const common = {
    className: "nano-diagram-text-field nodrag nowheel nopan",
    "aria-label": label,
    value,
    autoFocus: true,
    spellCheck: true,
    lang: "fr",
    onBlur: () => finishText(id, value),
    onKeyDown,
  };
  return multiline ? (
    <textarea {...common} onChange={(event) => setValue(event.target.value)} />
  ) : (
    <input {...common} onChange={(event) => setValue(event.target.value)} />
  );
}

/** Forme du schéma, affichée par React Flow. */
export function ShapeNode({ id, data, selected, width, height }: NodeProps<Node<ShapeNodeData>>) {
  const { measure, editingText } = useContext(DiagramContext);
  const shape = {
    ...data.shape,
    x: 0,
    y: 0,
    width: width ?? data.shape.width,
    height: height ?? data.shape.height,
  };
  const editing = editingText === id;
  return (
    <div className="nano-diagram-shape" data-kind={shape.kind}>
      <NodeResizer
        isVisible={selected && !editing}
        minWidth={DIAGRAM_MIN_SHAPE}
        minHeight={DIAGRAM_MIN_SHAPE}
        lineClassName="nano-diagram-resize-line"
        handleClassName="nano-diagram-resize-handle"
      />
      <svg
        className="nano-diagram-shape-drawing"
        width={shape.width}
        height={shape.height}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: shapeSvg(shape, measure) }}
      />
      {editing && (
        <TextField id={id} initial={data.shape.text} label="Texte de la forme" multiline />
      )}
      {HANDLES.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type="source"
          position={handle.position}
          className="nano-diagram-handle"
        />
      ))}
    </div>
  );
}
