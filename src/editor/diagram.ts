// Schémas dans l'éditeur (T2.20) : vue d'un bloc Schéma (dessin SVG hors modification), ouverture en
// modification au double clic ou à Entrée, fermeture par Échap ou un clic à côté, chaque modification
// enregistrée dans le document en une étape d'annulation, insertion au curseur. Sans React : l'éditeur
// de formes (React Flow) est monté par l'interface (`DiagramEditorMount`, src/ui/diagram/), chargé à la
// demande (critère 11). Le nœud est défini dans src/core/diagramSchema.ts.
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import type { Decoration, EditorView, NodeView } from "@tiptap/pm/view";
import { CellSelection } from "@tiptap/pm/tables";
import {
  approximateMeasure,
  chosenHeight,
  diagramAttrs,
  diagramHeight,
  DIAGRAM_FONT_FAMILY,
  DIAGRAM_FONT_SIZE,
  readDiagram,
  type DiagramData,
  type MeasureText,
} from "../core/diagram";
import { DIAGRAM_ATTRIBUTE, DIAGRAM_NODE, DiagramNode } from "../core/diagramSchema";
import { diagramToSvg } from "../core/diagramSvg";
import { BLOCK_ID_ATTRIBUTE } from "../core/schema";
import { dispatchAsOneStep } from "./assistantEdits";
import { pageBreakInsertPoint } from "./pageBreak";

/** État d'un schéma en modification, tel que l'éditeur de formes le reçoit. */
export interface DiagramSnapshot {
  data: DiagramData;
  /** Hauteur choisie à la poignée du bas, ou null (la hauteur suit le contenu). */
  height: number | null;
}

/**
 * Lien entre un schéma en modification et l'éditeur de formes de l'interface.
 * INVARIANT : le document reste la seule source des données. L'éditeur de formes affiche `current()`,
 * envoie chaque action par `commit`, et se redessine quand `subscribe` signale un changement
 * (annulation, recherche et remplacement…).
 */
export interface DiagramEditing {
  current(): DiagramSnapshot;
  /** Enregistre une action dans le document, en une étape d'annulation (critère 4). */
  commit(next: DiagramSnapshot): void;
  /** Ctrl/Cmd+Z et Ctrl/Cmd+Shift+Z dans le schéma : l'annulation du document, une action à la fois. */
  undo(): void;
  redo(): void;
  /** Revient au texte, le schéma sélectionné (Échap, critère 1). */
  close(): void;
  subscribe(listener: () => void): () => void;
  measure: MeasureText;
}

/**
 * Monte l'éditeur de formes dans `host` et renvoie de quoi le démonter. Fourni par l'interface, qui le
 * charge à la demande ; sans lui (tests), un schéma s'affiche mais ne s'ouvre pas en modification.
 */
export type DiagramEditorMount = (host: HTMLElement, editing: DiagramEditing) => () => void;

/** Texte affiché dans un schéma vide, hors du document et de l'impression. */
export const EMPTY_DIAGRAM_TEXT = "Schéma vide : double-cliquez pour dessiner.";

/** Spécification de la décoration de la recherche sur un schéma (src/editor/search.ts). */
export interface DiagramSearchSpec {
  diagramMatches: readonly string[];
}

let measureContext: CanvasRenderingContext2D | null | undefined;

/**
 * Mesure des textes à la police des formes, par un canvas ; mesure approchée sans canvas (jsdom).
 * La même mesure sert au dessin et à l'éditeur de formes : le texte se coupe au même endroit.
 */
export const measureDiagramText: MeasureText = (value) => {
  if (measureContext === undefined) {
    try {
      measureContext = document.createElement("canvas").getContext("2d");
    } catch {
      measureContext = null;
    }
    if (measureContext) {
      measureContext.font = `${DIAGRAM_FONT_SIZE}px "${DIAGRAM_FONT_FAMILY}", sans-serif`;
    }
  }
  return measureContext ? measureContext.measureText(value).width : approximateMeasure(value);
};

/** Données et hauteur choisie d'un nœud Schéma. */
export function snapshotOf(node: ProseMirrorNode): DiagramSnapshot {
  return { data: readDiagram(node.attrs), height: chosenHeight(node.attrs.height) };
}

/** Schémas affichés, pour ouvrir au clavier celui qui est sélectionné. */
interface DiagramRegistry {
  views: Set<DiagramView>;
  /** Identifiant du schéma en modification, pour le rouvrir si sa vue est recréée. */
  editingId: string | null;
}

let viewCounter = 0;

/** Vue d'un bloc Schéma : le dessin SVG, ou l'éditeur de formes en modification. */
class DiagramView implements NodeView {
  readonly dom: HTMLElement;
  private readonly drawing: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly host: HTMLElement;
  private readonly prefix = `nano-diagram-${(viewCounter += 1)}`;
  private highlighted: ReadonlySet<string> = new Set();
  private unmount: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();
  /** À l'impression, le schéma revient à son dessin SVG (critère 8). */
  private readonly onPrint = () => this.close(false);
  private readonly onOutside = (event: PointerEvent) => {
    if (event.target instanceof Node && !this.dom.contains(event.target)) this.close(false);
  };

  constructor(
    private node: ProseMirrorNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
    private readonly editor: Editor,
    private readonly mount: DiagramEditorMount | null,
    private readonly registry: DiagramRegistry,
  ) {
    this.dom = document.createElement("div");
    this.dom.className = "nano-diagram";
    this.dom.setAttribute(DIAGRAM_ATTRIBUTE, "");
    this.dom.contentEditable = "false";
    this.drawing = document.createElement("div");
    this.drawing.className = "nano-diagram-drawing";
    this.empty = document.createElement("div");
    this.empty.className = "nano-diagram-empty";
    this.empty.textContent = EMPTY_DIAGRAM_TEXT;
    this.empty.setAttribute("aria-hidden", "true");
    this.host = document.createElement("div");
    this.host.className = "nano-diagram-editor";
    this.host.hidden = true;
    this.dom.append(this.drawing, this.empty, this.host);
    this.dom.addEventListener("dblclick", (event) => {
      if (this.editing) return;
      event.preventDefault();
      this.open();
    });
    this.dom.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.editing) {
        event.preventDefault();
        this.close(true);
      }
    });
    registry.views.add(this);
    window.addEventListener("beforeprint", this.onPrint);
    this.render();
    if (registry.editingId !== null && registry.editingId === this.id) {
      queueMicrotask(() => this.open());
    }
  }

  get id(): string | null {
    const id: unknown = this.node.attrs[BLOCK_ID_ATTRIBUTE];
    return typeof id === "string" && id !== "" ? id : null;
  }

  get editing(): boolean {
    return this.unmount !== null;
  }

  /** Position du nœud dans le document, si la vue est toujours affichée. */
  position(): number | undefined {
    return this.getPos();
  }

  private render(): void {
    const { data, height } = snapshotOf(this.node);
    const id = this.id;
    if (id) this.dom.dataset.id = id;
    this.dom.classList.toggle("nano-diagram-is-empty", data.shapes.length === 0);
    this.dom.classList.toggle("nano-diagram-editing", this.editing);
    this.drawing.hidden = this.editing;
    this.empty.hidden = this.editing || data.shapes.length > 0;
    if (!this.editing) {
      this.drawing.innerHTML = diagramToSvg(data, {
        height: diagramHeight(data, height),
        idPrefix: this.prefix,
        measure: measureDiagramText,
        highlighted: this.highlighted,
      });
    }
  }

  /** Ouvre le schéma en modification (critère 1). */
  open(): void {
    if (this.editing || !this.mount || !this.editor.isEditable) return;
    for (const other of this.registry.views) if (other !== this) other.close(false);
    this.registry.editingId = this.id;
    const editing: DiagramEditing = {
      current: () => snapshotOf(this.node),
      commit: (next) => this.commit(next),
      undo: () => {
        this.editor.commands.undo();
      },
      redo: () => {
        this.editor.commands.redo();
      },
      close: () => this.close(true),
      subscribe: (listener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
      measure: measureDiagramText,
    };
    this.host.hidden = false;
    this.unmount = this.mount(this.host, editing);
    document.addEventListener("pointerdown", this.onOutside, true);
    this.render();
  }

  /**
   * Revient au texte. `select` : le schéma reste sélectionné et le document reprend le focus (Échap) ;
   * sinon (clic à côté), le clic place lui-même le curseur.
   */
  close(select: boolean): void {
    if (!this.unmount) return;
    const unmount = this.unmount;
    this.unmount = null;
    if (this.registry.editingId === this.id) this.registry.editingId = null;
    document.removeEventListener("pointerdown", this.onOutside, true);
    unmount();
    this.host.hidden = true;
    this.render();
    const pos = this.getPos();
    if (select && pos !== undefined && !this.editor.isDestroyed) {
      this.view.dispatch(
        this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, pos)),
      );
      this.view.focus();
    }
  }

  private commit(next: DiagramSnapshot): void {
    const pos = this.getPos();
    if (pos === undefined || this.editor.isDestroyed) return;
    const attrs = { ...this.node.attrs, ...diagramAttrs(next.data), height: next.height };
    dispatchAsOneStep(this.editor, this.view.state.tr.setNodeMarkup(pos, undefined, attrs));
  }

  update(node: ProseMirrorNode, decorations: readonly Decoration[]): boolean {
    if (node.type !== this.node.type) return false;
    const highlighted = new Set<string>();
    for (const decoration of decorations) {
      const spec = decoration.spec as Partial<DiagramSearchSpec>;
      for (const id of spec.diagramMatches ?? []) highlighted.add(id);
    }
    const changed =
      node !== this.node ||
      highlighted.size !== this.highlighted.size ||
      [...highlighted].some((id) => !this.highlighted.has(id));
    this.node = node;
    this.highlighted = highlighted;
    if (changed) {
      this.render();
      for (const listener of this.listeners) listener();
    }
    return true;
  }

  /** En modification, l'éditeur de formes gère seul le clavier et la souris. */
  stopEvent(event: Event): boolean {
    return this.editing && event.target instanceof Node && this.host.contains(event.target);
  }

  /** Le contenu de la vue n'est modifié que par elle-même. */
  ignoreMutation(): boolean {
    return true;
  }

  selectNode(): void {
    this.dom.classList.add("ProseMirror-selectednode");
  }

  deselectNode(): void {
    this.dom.classList.remove("ProseMirror-selectednode");
  }

  destroy(): void {
    this.registry.views.delete(this);
    window.removeEventListener("beforeprint", this.onPrint);
    document.removeEventListener("pointerdown", this.onOutside, true);
    // Sans `close` : si la vue est recréée (annulation de Yjs), `editingId` rouvre le schéma dans la
    // nouvelle vue. Sinon (schéma supprimé), il est oublié.
    const wasEditing = this.editing;
    this.unmount?.();
    this.unmount = null;
    const id = this.id;
    if (wasEditing) {
      queueMicrotask(() => {
        const alive = [...this.registry.views].some((view) => view.id === id);
        if (!alive && this.registry.editingId === id) this.registry.editingId = null;
      });
    }
  }
}

const diagramKeysKey = new PluginKey("diagramKeys");

/**
 * Nœud « schéma » de l'éditeur : celui du schéma partagé, avec sa vue. Il remplace `DiagramNode` à la
 * même place dans les extensions (editorOptions.ts), comme le sommaire.
 * Entrée sur un schéma sélectionné l'ouvre en modification (critère 13, clavier) ; un schéma qui termine
 * le document est suivi d'un paragraphe vide, pour pouvoir écrire après.
 */
export function createDiagramNode(mount: DiagramEditorMount | null) {
  const registry: DiagramRegistry = { views: new Set(), editingId: null };
  return DiagramNode.extend<
    object,
    { registry: DiagramRegistry; mount: DiagramEditorMount | null }
  >({
    addStorage() {
      return { registry, mount };
    },
    addNodeView() {
      const editor = this.editor;
      return ({ node, view, getPos }) =>
        new DiagramView(node, view, getPos, editor, mount, registry);
    },
    addKeyboardShortcuts() {
      return {
        Enter: ({ editor }) => {
          const { selection } = editor.state;
          if (!(selection instanceof NodeSelection) || selection.node.type.name !== DIAGRAM_NODE) {
            return false;
          }
          return openDiagramAt(editor, selection.from);
        },
      };
    },
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: diagramKeysKey,
          appendTransaction(transactions, _oldState, newState) {
            if (!transactions.some((tr) => tr.docChanged)) return null;
            const { doc, schema } = newState;
            const paragraph = schema.nodes.paragraph;
            if (doc.lastChild?.type.name !== DIAGRAM_NODE || !paragraph) return null;
            const tr = newState.tr.insert(doc.content.size, paragraph.create());
            if (transactions.every((change) => change.getMeta("addToHistory") === false)) {
              tr.setMeta("addToHistory", false);
            }
            return tr;
          },
        }),
      ];
    },
  });
}

/**
 * Insère un schéma vide au curseur (critère 1), en une étape d'annulation, comme un saut de page ou un
 * sommaire. Un texte sélectionné est remplacé ; des cellules sélectionnées ne sont jamais effacées. Le
 * schéma inséré est sélectionné et s'ouvre en modification.
 * @returns faux si le schéma du document n'a pas de schéma
 */
export function insertDiagram(editor: Editor): boolean {
  const { state } = editor;
  const type = state.schema.nodes[DIAGRAM_NODE];
  const paragraph = state.schema.nodes.paragraph;
  if (!type || !paragraph) return false;
  const tr = state.tr;
  const replaces =
    !state.selection.empty &&
    !(state.selection instanceof NodeSelection) &&
    !(state.selection instanceof CellSelection);
  if (replaces) tr.deleteSelection();
  const { pos, mode } = pageBreakInsertPoint(tr.selection);
  const diagram = type.create();
  let at: number;
  if (mode === "split") {
    tr.split(pos);
    at = pos + 1;
    tr.insert(at, diagram);
  } else if (mode === "before") {
    at = pos;
    tr.insert(at, diagram);
  } else {
    at = pos;
    tr.insert(at, [diagram, paragraph.create()]);
  }
  tr.setSelection(NodeSelection.create(tr.doc, at));
  dispatchAsOneStep(editor, tr.scrollIntoView());
  openDiagramAt(editor, at);
  return true;
}

/**
 * Ouvre en modification le schéma à la position `pos`.
 * @returns faux s'il n'y a pas de schéma affiché là, ou pas d'éditeur de formes
 */
export function openDiagramAt(editor: Editor, pos: number): boolean {
  const storage = (
    editor.storage as unknown as Record<string, { registry?: DiagramRegistry; mount?: unknown }>
  )[DIAGRAM_NODE];
  if (!storage?.registry || !storage.mount) return false;
  const target = [...storage.registry.views].find((view) => view.position() === pos);
  if (!target) return false;
  target.open();
  return true;
}

/** Vrai si la sélection est un schéma. */
export function selectedDiagram(editor: Editor): boolean {
  const { selection } = editor.state;
  return selection instanceof NodeSelection && selection.node.type.name === DIAGRAM_NODE;
}
