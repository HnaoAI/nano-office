// Éditeur de formes d'un schéma (T2.20), avec React Flow (@xyflow/react, MIT) : formes, flèches reliées
// aux points d'accroche, grille magnétique, sélection multiple, copier-coller, texte des formes et des
// flèches, fond, poignée du bas. Chargé à la demande par mountDiagramEditor.ts (critère 11).
// INVARIANT : le document reste la seule source des données (DiagramEditing, src/editor/diagram.ts) :
// chaque action terminée est enregistrée par `commit`, en une étape d'annulation (critère 4).
import "@xyflow/react/dist/base.css";
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  contentBottom,
  DIAGRAM_BOTTOM_PADDING,
  DIAGRAM_GRID,
  DIAGRAM_MIN_HEIGHT,
  DIAGRAM_SHAPE_NAMES,
  diagramHeight,
  type DiagramData,
  type DiagramShape,
  type DiagramShapeKind,
  type DiagramSide,
} from "../../core/diagram";
import {
  addShape,
  connect,
  copyItems,
  pasteItems,
  placeShapes,
  removeItems,
  setFill,
  setText,
} from "../../core/diagramEdits";
import type { DiagramEditing, DiagramSnapshot } from "../../editor/diagram";
import { isMacPlatform } from "../../editor/platform";
import { ArrowEdge, ArrowMarker } from "./ArrowEdge";
import { DiagramContext, type DiagramContextValue } from "./diagramContext";
import { DiagramToolbar } from "./DiagramToolbar";
import { ShapeNode, type ShapeNodeData } from "./ShapeNode";

/** Formes et flèches copiées, gardées le temps de la session pour coller dans un schéma (critère 4). */
let copied: DiagramData | null = null;

const nodeTypes = { shape: ShapeNode };
const edgeTypes = { arrow: ArrowEdge };

/** Textes d'accessibilité de React Flow, en français (critère 13). */
const ARIA_LABELS = {
  // `default` est lu quand le clavier de React Flow est coupé, `keyboardDisabled` quand il est actif (le
  // cas ici) : les noms de React Flow sont inversés, ses textes d'origine le montrent.
  "node.a11yDescription.default":
    "Entrée ou Espace pour choisir une forme, Suppr pour la supprimer, et Échap pour revenir au texte.",
  "node.a11yDescription.keyboardDisabled":
    "Entrée ou Espace pour choisir une forme, puis les flèches pour la déplacer, Suppr pour la supprimer, et Échap pour revenir au texte.",
  "node.a11yDescription.ariaLiveMessage": ({ x, y }: { direction: string; x: number; y: number }) =>
    `Forme déplacée : ${x}, ${y}.`,
  "edge.a11yDescription.default":
    "Entrée ou Espace pour choisir une flèche, puis Suppr pour la supprimer.",
  "handle.ariaLabel": "Point d'accroche d'une flèche",
};

function newId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function shapeLabel(shape: DiagramShape): string {
  const text = shape.text.replace(/\s+/g, " ").trim();
  return text === "" ? `${DIAGRAM_SHAPE_NAMES[shape.kind]} sans texte` : text;
}

function toNodes(data: DiagramData, selected: ReadonlySet<string>): Node<ShapeNodeData>[] {
  return data.shapes.map((shape) => ({
    id: shape.id,
    type: "shape",
    position: { x: shape.x, y: shape.y },
    width: shape.width,
    height: shape.height,
    data: { shape },
    selected: selected.has(shape.id),
    ariaLabel: shapeLabel(shape),
  }));
}

function toEdges(data: DiagramData, selected: ReadonlySet<string>): Edge[] {
  return data.arrows.map((arrow) => ({
    id: arrow.id,
    type: "arrow",
    source: arrow.from,
    sourceHandle: arrow.fromSide,
    target: arrow.to,
    targetHandle: arrow.toSide,
    data: { text: arrow.text, fromSide: arrow.fromSide, toSide: arrow.toSide },
    selected: selected.has(arrow.id),
    ariaLabel: arrow.text.trim() === "" ? "Flèche" : `Flèche « ${arrow.text.trim()} »`,
  }));
}

function selectedIds(items: readonly { id: string; selected?: boolean }[]): Set<string> {
  return new Set(items.filter((item) => item.selected).map((item) => item.id));
}

/** Formes à leur position et à leur taille affichées (pendant un déplacement ou à la poignée). */
function liveShapes(data: DiagramData, nodes: readonly Node<ShapeNodeData>[]): DiagramShape[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return data.shapes.map((shape) => {
    const node = byId.get(shape.id);
    if (!node) return shape;
    return {
      ...shape,
      x: node.position.x,
      y: node.position.y,
      width: node.width ?? shape.width,
      height: node.height ?? shape.height,
    };
  });
}

function isSide(value: string | null | undefined): value is DiagramSide {
  return value === "top" || value === "right" || value === "bottom" || value === "left";
}

/** Éditeur de formes d'un schéma en modification. */
export function DiagramEditor({ editing }: { editing: DiagramEditing }) {
  const [snapshot, setSnapshot] = useState<DiagramSnapshot>(() => editing.current());
  const [nodes, setNodes] = useState<Node<ShapeNodeData>[]>(() =>
    toNodes(snapshot.data, new Set()),
  );
  const [edges, setEdges] = useState<Edge[]>(() => toEdges(snapshot.data, new Set()));
  const [editingText, setEditingText] = useState<string | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const area = useRef<HTMLDivElement>(null);
  // Largeur de la zone, qui borne le déplacement des formes à droite (elle suit la largeur de la page).
  const [areaLimit, setAreaLimit] = useState(Number.POSITIVE_INFINITY);
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    const measure = () => setAreaLimit(element.clientWidth || Number.POSITIVE_INFINITY);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Dernières formes et flèches affichées, lues par les actions sans attendre un nouveau rendu.
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useLayoutEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  });

  // À l'ouverture, le schéma prend le focus : Échap, Tab, Suppr et Ctrl/Cmd+Z s'y appliquent (critère 13).
  useEffect(() => {
    area.current?.focus({ preventScroll: true });
  }, []);

  // Document modifié (action enregistrée, annulation, remplacement) : formes et flèches relues, sélection gardée.
  useEffect(
    () =>
      editing.subscribe(() => {
        const next = editing.current();
        setSnapshot(next);
        setNodes(toNodes(next.data, selectedIds(nodesRef.current)));
        setEdges(toEdges(next.data, selectedIds(edgesRef.current)));
      }),
    [editing],
  );

  const data = snapshot.data;
  const commit = useCallback(
    (next: DiagramData, height: number | null = snapshot.height) => {
      editing.commit({ data: next, height });
    },
    [editing, snapshot.height],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<ShapeNodeData>>[]) => {
      const updated = applyNodeChanges(changes, nodesRef.current);
      nodesRef.current = updated;
      setNodes(updated);
      // Fin d'un déplacement (souris ou flèches du clavier) ou de la poignée d'une forme : enregistré.
      const ended = changes.some(
        (change) =>
          (change.type === "position" && change.dragging === false) ||
          (change.type === "dimensions" && change.resizing === false),
      );
      if (!ended) return;
      const places = new Map(
        liveShapes(data, updated).map((shape) => [
          shape.id,
          { x: shape.x, y: shape.y, width: shape.width, height: shape.height },
        ]),
      );
      commit(placeShapes(data, places, area.current?.clientWidth ?? Number.POSITIVE_INFINITY));
    },
    [commit, data],
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const updated = applyEdgeChanges(changes, edgesRef.current);
    edgesRef.current = updated;
    setEdges(updated);
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      const { source, target, sourceHandle, targetHandle } = connection;
      if (!isSide(sourceHandle) || !isSide(targetHandle)) return;
      commit(
        connect(
          data,
          { from: source, fromSide: sourceHandle, to: target, toSide: targetHandle },
          newId,
        ),
      );
    },
    [commit, data],
  );

  const removeSelection = useCallback(() => {
    const shapes = selectedIds(nodesRef.current);
    const arrows = selectedIds(edgesRef.current);
    if (shapes.size === 0 && arrows.size === 0) return;
    commit(removeItems(data, shapes, arrows));
  }, [commit, data]);

  const onDelete = useCallback(
    ({ nodes: removed, edges: removedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      commit(
        removeItems(
          data,
          new Set(removed.map((node) => node.id)),
          new Set(removedEdges.map((edge) => edge.id)),
        ),
      );
    },
    [commit, data],
  );

  const areaWidth = () => area.current?.clientWidth ?? 600;

  const add = (kind: DiagramShapeKind) => {
    const result = addShape(data, kind, areaWidth(), newId);
    nodesRef.current = nodesRef.current.map((node) => ({ ...node, selected: false }));
    edgesRef.current = edgesRef.current.map((edge) => ({ ...edge, selected: false }));
    setNodes(nodesRef.current);
    setEdges(edgesRef.current);
    commit(result.data);
    // La nouvelle forme est choisie : on peut tout de suite la déplacer au clavier ou la colorer.
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === result.id })));
  };

  const fill = (color: string | null) => {
    const ids = selectedIds(nodesRef.current);
    if (ids.size > 0) commit(setFill(data, ids, color));
  };

  const finishText = useCallback(
    (id: string, text: string) => {
      setEditingText(null);
      const current = [...data.shapes, ...data.arrows].find((item) => item.id === id);
      if (current && current.text !== text) commit(setText(data, id, text));
      area.current?.focus();
    },
    [commit, data],
  );

  // Formes choisies avant la touche : React Flow choisit la forme à Entrée avant onKeyDown.
  const selectedBeforeKey = useRef<ReadonlySet<string>>(new Set());
  const onKeyDownCapture = () => {
    selectedBeforeKey.current = selectedIds(nodesRef.current);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("textarea, input")) return;
    const onButton = target.closest("button") !== null;
    const mod = isMacPlatform() ? event.metaKey : event.ctrlKey;
    const key = event.key.toLowerCase();
    if (mod && key === "z") {
      event.preventDefault();
      if (event.shiftKey) editing.redo();
      else editing.undo();
    } else if (mod && key === "y") {
      event.preventDefault();
      editing.redo();
    } else if (mod && key === "c") {
      event.preventDefault();
      copied = copyItems(data, selectedIds(nodesRef.current));
    } else if (mod && key === "x") {
      event.preventDefault();
      copied = copyItems(data, selectedIds(nodesRef.current));
      removeSelection();
    } else if (mod && key === "v") {
      event.preventDefault();
      if (!copied || copied.shapes.length === 0) return;
      const result = pasteItems(data, copied, newId);
      const pasted = new Set(result.ids);
      // Un deuxième collage reprend les formes collées et leurs flèches, décalées une fois de plus.
      copied = copyItems(result.data, pasted);
      nodesRef.current = nodesRef.current.map((node) => ({ ...node, selected: false }));
      commit(result.data);
      setNodes((current) => current.map((node) => ({ ...node, selected: pasted.has(node.id) })));
    } else if (mod && key === "a") {
      event.preventDefault();
      setNodes((current) => current.map((node) => ({ ...node, selected: true })));
    } else if (event.key === "Enter" && !mod && !onButton) {
      // Entrée sur une forme atteinte au clavier : la première fois la choisit (React Flow), la
      // suivante permet d'écrire son texte (critère 13).
      const focused = target.closest<HTMLElement>(".react-flow__node")?.dataset.id;
      if (focused && selectedBeforeKey.current.has(focused)) {
        event.preventDefault();
        setEditingText(focused);
      }
    }
  };

  // Poignée du bas (critère 6) : la hauteur suit le pointeur, puis elle est enregistrée.
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const start = diagramHeight(data, snapshot.height);
    const minimum = Math.max(DIAGRAM_MIN_HEIGHT, contentBottom(data) + DIAGRAM_BOTTOM_PADDING);
    const heightAt = (clientY: number) =>
      Math.max(minimum, Math.round((start + clientY - startY) / DIAGRAM_GRID) * DIAGRAM_GRID);
    const move = (moveEvent: PointerEvent) => setDragHeight(heightAt(moveEvent.clientY));
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", cancel);
      handle.removeEventListener("lostpointercapture", cancel);
    };
    const end = (endEvent: PointerEvent) => {
      stop();
      setDragHeight(null);
      commit(data, heightAt(endEvent.clientY));
    };
    // Un geste interrompu (écran tactile, changement de fenêtre) ne laisse pas la poignée bloquée.
    const cancel = () => {
      stop();
      setDragHeight(null);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", cancel);
    handle.addEventListener("lostpointercapture", cancel);
  };

  const shapes = useMemo(() => liveShapes(data, nodes), [data, nodes]);
  const live = useMemo(() => ({ shapes, arrows: data.arrows }), [shapes, data.arrows]);
  const height = dragHeight ?? diagramHeight(live, snapshot.height);
  const selectedShapes = nodes.filter((node) => node.selected).map((node) => node.data.shape);
  const context = useMemo<DiagramContextValue>(
    () => ({
      shapes: new Map(shapes.map((shape) => [shape.id, shape])),
      measure: editing.measure,
      editingText,
      startText: setEditingText,
      finishText,
    }),
    [shapes, editing.measure, editingText, finishText],
  );

  return (
    <DiagramContext.Provider value={context}>
      {/* Le clavier de toute la zone (barre comprise) : annuler, copier, coller (critère 4). */}
      <div
        className="nano-diagram-wrapper"
        onKeyDownCapture={onKeyDownCapture}
        onKeyDown={onKeyDown}
      >
        <ArrowMarker />
        <DiagramToolbar
          onAdd={add}
          onFill={fill}
          onDelete={removeSelection}
          onClose={editing.close}
          selected={selectedShapes}
          canDelete={selectedShapes.length > 0 || edges.some((edge) => edge.selected)}
        />
        <div
          ref={area}
          className="nano-diagram-area"
          style={{ height }}
          role="application"
          aria-label="Schéma en modification"
          tabIndex={-1}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDelete={onDelete}
            onNodeDoubleClick={(_event, node) => setEditingText(node.id)}
            onEdgeDoubleClick={(_event, edge) => setEditingText(edge.id)}
            connectionMode={ConnectionMode.Loose}
            snapToGrid
            snapGrid={[DIAGRAM_GRID, DIAGRAM_GRID]}
            nodeExtent={[
              [0, 0],
              [areaLimit, Number.POSITIVE_INFINITY],
            ]}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            minZoom={1}
            maxZoom={1}
            panOnDrag={false}
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            autoPanOnNodeDrag={false}
            autoPanOnConnect={false}
            selectionOnDrag
            deleteKeyCode={["Delete", "Backspace"]}
            multiSelectionKeyCode={isMacPlatform() ? "Meta" : "Control"}
            ariaLabelConfig={ARIA_LABELS}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={DIAGRAM_GRID * 2} size={1} />
          </ReactFlow>
        </div>
        <div
          className="nano-diagram-resize"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Hauteur du schéma"
          title="Agrandir le schéma"
          onPointerDown={startResize}
        />
      </div>
    </DiagramContext.Provider>
  );
}
