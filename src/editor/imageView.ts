// Affichage d'une image dans l'éditeur (T1.9, critères 4 et 9) : l'image, alignée à gauche, au centre
// ou à droite, deux poignées pour la redimensionner en gardant ses proportions, sans dépasser la page,
// ou un cadre « Image manquante ». Vue ProseMirror écrite à la main, sans React.
// Écrite à la main plutôt qu'avec ResizableNodeView de Tiptap, qui fixe aussi la hauteur en pixels :
// l'image se déformerait sur une page plus étroite.
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import type { EditorView, NodeView } from "@tiptap/pm/view";
import { isImageHash } from "../core/images";
import type { ImageLibrary } from "./imageLibrary";

/** Largeur minimale d'une image redimensionnée, en pixels. */
export const MIN_IMAGE_WIDTH = 24;

/** Texte du cadre d'une image dont le contenu manque dans le fichier (critère 9). */
export const MISSING_IMAGE_TEXT = "Image manquante";

/** Côté d'une poignée de redimensionnement. */
type HandleSide = "left" | "right";

/** Vue d'un nœud image. */
export class ImageView implements NodeView {
  readonly dom: HTMLElement;
  private readonly frame: HTMLElement;
  private content: HTMLElement | null = null;
  private shownHash: string | null = null;
  private subscribedHash: string | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private node: ProseMirrorNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
    private readonly library: ImageLibrary,
  ) {
    this.dom = document.createElement("div");
    this.dom.className = "nano-image";
    this.frame = document.createElement("span");
    this.frame.className = "nano-image-frame";
    this.dom.appendChild(this.frame);
    for (const side of ["left", "right"] as const) this.frame.appendChild(this.createHandle(side));
    this.render();
  }

  /** Met à jour l'affichage après une modification du nœud (largeur, alignement, texte). */
  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  /** Les poignées gèrent elles-mêmes la souris ; ProseMirror ne doit pas en faire une sélection. */
  stopEvent(event: Event): boolean {
    return event.target instanceof HTMLElement && event.target.dataset.handle !== undefined;
  }

  /** Le contenu de la vue n'est modifié que par elle-même. */
  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.unsubscribe?.();
  }

  private render(): void {
    const { hash, alt, width, textAlign, id } = this.node.attrs as {
      hash: unknown;
      alt: unknown;
      width: unknown;
      textAlign: unknown;
      id: unknown;
    };
    // « Justifié » n'a pas de sens pour une image : elle reste à gauche.
    this.dom.dataset.align = textAlign === "center" || textAlign === "right" ? textAlign : "left";
    if (typeof id === "string") this.dom.dataset.id = id;
    this.frame.style.width = typeof width === "number" ? `${String(width)}px` : "";
    const validHash = isImageHash(hash) ? hash : null;
    // INVARIANT : on ne s'abonne qu'au changement d'empreinte, jamais depuis l'avis lui-même, sinon
    // l'avis ajouterait un nouvel abonné pendant qu'on parcourt les abonnés (boucle sans fin).
    if (validHash !== this.subscribedHash) {
      this.unsubscribe?.();
      this.subscribedHash = validHash;
      this.unsubscribe = validHash
        ? this.library.subscribe(validHash, () => {
            this.shownHash = null;
            this.render();
          })
        : null;
    }
    const url = validHash ? this.library.url(validHash) : null;
    if (validHash !== this.shownHash || this.content === null || (url !== null) !== this.isImg()) {
      this.content?.remove();
      this.content = url ? this.createImg(url) : this.createMissing();
      this.frame.prepend(this.content);
      this.shownHash = validHash;
    }
    const text = typeof alt === "string" ? alt : "";
    if (this.content instanceof HTMLImageElement) this.content.alt = text;
    else
      this.content.setAttribute(
        "aria-label",
        text ? `${MISSING_IMAGE_TEXT} : ${text}` : MISSING_IMAGE_TEXT,
      );
  }

  private isImg(): boolean {
    return this.content instanceof HTMLImageElement;
  }

  private createImg(url: string): HTMLImageElement {
    const img = document.createElement("img");
    img.src = url;
    img.draggable = false;
    return img;
  }

  private createMissing(): HTMLElement {
    const box = document.createElement("span");
    box.className = "nano-image-missing";
    box.setAttribute("role", "img");
    box.textContent = MISSING_IMAGE_TEXT;
    return box;
  }

  /**
   * Poignée : la tirer change la largeur, la hauteur suit (proportions gardées, critère 4). Une image
   * centrée grandit des deux côtés, d'où le double déplacement. La largeur est enregistrée au lâcher,
   * en une seule étape d'annulation.
   */
  private createHandle(side: HandleSide): HTMLElement {
    const handle = document.createElement("span");
    handle.className = `nano-image-handle nano-image-handle-${side}`;
    handle.dataset.handle = side;
    handle.setAttribute("aria-hidden", "true");
    handle.addEventListener("pointerdown", (event) => {
      if (!this.view.editable) return;
      event.preventDefault();
      event.stopPropagation();
      this.selectSelf();
      handle.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startWidth = this.frame.getBoundingClientRect().width;
      const maxWidth = Math.max(MIN_IMAGE_WIDTH, this.dom.clientWidth);
      const factor = (side === "right" ? 1 : -1) * (this.dom.dataset.align === "center" ? 2 : 1);
      let width = startWidth;
      const onMove = (move: PointerEvent) => {
        width = Math.min(
          maxWidth,
          Math.max(MIN_IMAGE_WIDTH, startWidth + (move.clientX - startX) * factor),
        );
        this.frame.style.width = `${String(Math.round(width))}px`;
      };
      const onUp = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        this.commitWidth(Math.round(width));
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    });
    return handle;
  }

  private selectSelf(): void {
    const pos = this.getPos();
    if (pos === undefined) return;
    const { state } = this.view;
    if (state.selection instanceof NodeSelection && state.selection.from === pos) return;
    this.view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
  }

  private commitWidth(width: number): void {
    const pos = this.getPos();
    if (pos === undefined || this.node.attrs.width === width) return;
    const tr = this.view.state.tr.setNodeAttribute(pos, "width", width);
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    this.view.dispatch(tr);
  }
}
