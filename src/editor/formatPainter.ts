// Pinceau « Reproduire la mise en forme » dans l'éditeur (PL4) : état du pinceau (éteint, une fois, jusqu'à Échap),
// application à une sélection faite à la souris ou au mot cliqué, pointeur en pinceau. Sans React.
// Le calcul de la mise en forme copiée et appliquée est dans src/core/formatPainter.ts.
// INVARIANT : l'état du pinceau vit dans le plugin, jamais dans le document : rien n'est enregistré (critère 10).
import { Extension, type Editor } from "@tiptap/core";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
} from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { yUndoPluginKey } from "@tiptap/y-tiptap";
import type * as Y from "yjs";
import {
  applyFormat,
  captureFormat,
  wordRangeAt,
  type CopiedFormat,
  type PaintRange,
} from "../core/formatPainter";

/** État du pinceau : éteint (`format` null), pour une fois, ou jusqu'à Échap (`sticky`, critère 6). */
export interface FormatPainterState {
  format: CopiedFormat | null;
  sticky: boolean;
}

/** Clé du plugin, pour lire son état. */
export const formatPainterKey = new PluginKey<FormatPainterState>("formatPainter");

/** Classe posée sur l'éditeur tant que le pinceau est actif : pointeur en pinceau (critère 9, toolbar.css). */
export const FORMAT_PAINTING_CLASS = "nano-format-painting";

/**
 * Attente après un clic avant d'appliquer, en millisecondes : un double ou un triple clic qui suit le premier doit
 * pouvoir sélectionner un mot ou un paragraphe entier, sans que le premier clic ait déjà éteint le pinceau.
 */
export const MULTI_CLICK_WAIT_MS = 400;

const OFF: FormatPainterState = { format: null, sticky: false };

/** Vrai si le pinceau est actif. */
export function formatPainterActive(state: EditorState): boolean {
  return formatPainterKey.getState(state)?.format != null;
}

/** Vrai si le pinceau reste actif après une application (double clic sur le bouton). */
export function formatPainterSticky(state: EditorState): boolean {
  return formatPainterKey.getState(state)?.sticky === true;
}

/**
 * Allume le pinceau avec la mise en forme du curseur ou du début de la sélection (critère 2).
 * @param sticky true pour le garder jusqu'à Échap (double clic), false pour une seule application (un clic)
 * @returns false si la sélection n'a pas de texte dont copier la mise en forme (image choisie d'un clic)
 */
export function startFormatPainter(editor: Editor, sticky: boolean): boolean {
  const format = captureFormat(editor.state);
  if (!format) return false;
  editor.view.dispatch(editor.state.tr.setMeta(formatPainterKey, { format, sticky }));
  return true;
}

/** Éteint le pinceau, sans rien changer au document. */
export function stopFormatPainter(view: EditorView): void {
  if (!formatPainterActive(view.state)) return;
  view.dispatch(view.state.tr.setMeta(formatPainterKey, OFF));
}

/**
 * Plages qui reçoivent la mise en forme : la sélection faite à la souris, ou le mot cliqué (critère 5).
 * Un objet choisi d'un clic (image, schéma, saut de page, sommaire) ne reçoit rien (critère 8).
 * @returns null si rien ne doit changer
 */
export function paintTargets(state: EditorState): PaintRange[] | null {
  const { selection } = state;
  if (selection instanceof NodeSelection) return null;
  if (!selection.empty) {
    return selection.ranges.map(({ $from, $to }) => ({ from: $from.pos, to: $to.pos }));
  }
  if (!selection.$from.parent.isTextblock) return null;
  const word = wordRangeAt(state.doc, selection.from);
  return [word ?? { from: selection.from, to: selection.from }];
}

/**
 * Applique la mise en forme du pinceau aux cibles de la sélection actuelle, en une seule étape d'annulation
 * (critère 7), puis éteint le pinceau s'il ne servait qu'une fois (critère 6).
 * @returns true si le document a reçu la mise en forme
 */
export function paintSelection(view: EditorView): boolean {
  const painter = formatPainterKey.getState(view.state);
  if (!painter?.format) return false;
  const targets = paintTargets(view.state);
  if (!targets) return false;
  const tr = applyFormat(view.state, targets, painter.format);
  if (!tr) return false;
  if (!painter.sticky) tr.setMeta(formatPainterKey, OFF);
  // Une étape à elle seule : Yjs regroupe sinon les modifications rapprochées (moins de 500 ms).
  const undoManager = yUndoPluginKey.getState(view.state)?.undoManager as Y.UndoManager | undefined;
  undoManager?.stopCapturing();
  view.dispatch(tr);
  undoManager?.stopCapturing();
  return true;
}

/** Champs posés dans le document (texte d'une forme de schéma) : un clic dedans n'applique rien. */
const FIELD_SELECTOR = "input, textarea, select, [contenteditable='true']";

/**
 * Application à la souris : au bouton lâché sur une sélection, ou après un court délai sur un simple ou un double
 * clic, pour laisser un clic suivant agrandir la sélection (mot, puis paragraphe). Un nouveau clic annule l'attente.
 */
function attachMousePainting(view: EditorView): () => void {
  let pressed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onMouseDown = (event: MouseEvent) => {
    clearTimeout(timer);
    const target = event.target instanceof Element ? event.target : null;
    const field = target?.closest(FIELD_SELECTOR);
    pressed =
      event.button === 0 &&
      formatPainterActive(view.state) &&
      (field === null || field === undefined || field === view.dom);
  };
  const onMouseUp = (event: MouseEvent) => {
    if (!pressed || event.button !== 0) return;
    pressed = false;
    const clicks = event.detail;
    // Une tâche plus tard : ProseMirror a lu la sélection du navigateur (glisser, double ou triple clic).
    timer = setTimeout(() => {
      const dragged = clicks <= 1 && !view.state.selection.empty;
      if (dragged || clicks >= 3) {
        paint();
        return;
      }
      timer = setTimeout(paint, MULTI_CLICK_WAIT_MS);
    }, 0);
  };
  const paint = () => {
    if (!view.isDestroyed) paintSelection(view);
  };
  const onDragStart = () => {
    pressed = false;
  };
  view.dom.addEventListener("mousedown", onMouseDown);
  window.addEventListener("dragstart", onDragStart, true);
  window.addEventListener("mouseup", onMouseUp, true);
  return () => {
    clearTimeout(timer);
    view.dom.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("dragstart", onDragStart, true);
    window.removeEventListener("mouseup", onMouseUp, true);
  };
}

/**
 * Extension du pinceau : état, Échap qui l'éteint (critère 6), classe du pointeur (critère 9), application à la
 * souris (critère 5). Sans raccourci pour l'allumer : Ctrl/Cmd+Shift+V reste le collage du texte seul (T1.5).
 */
export const FormatPainter = Extension.create({
  name: "formatPainter",
  addProseMirrorPlugins() {
    return [
      new Plugin<FormatPainterState>({
        key: formatPainterKey,
        state: {
          init: () => OFF,
          apply: (tr, value) => {
            const meta = tr.getMeta(formatPainterKey) as FormatPainterState | undefined;
            return meta ?? value;
          },
        },
        props: {
          attributes: (state): Record<string, string> =>
            formatPainterActive(state) ? { class: FORMAT_PAINTING_CLASS } : {},
          handleDOMEvents: {
            // Pinceau actif, un clic dans une sélection ne doit pas la déplacer par glisser-déposer : elle est
            // d'abord ramenée au point cliqué, et le glisser sélectionne la cible comme ailleurs.
            mousedown: (view, event) => {
              if (event.button !== 0 || !formatPainterActive(view.state)) return false;
              if (view.state.selection.empty) return false;
              const found = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (!found) return false;
              const $pos = view.state.doc.resolve(found.pos);
              if (!$pos.parent.inlineContent) return false;
              view.dispatch(
                view.state.tr.setSelection(TextSelection.create(view.state.doc, found.pos)),
              );
              return false;
            },
            dragstart: (view, event) => {
              if (!formatPainterActive(view.state)) return false;
              event.preventDefault();
              return true;
            },
          },
          handleKeyDown: (view, event) => {
            if (event.key !== "Escape" || !formatPainterActive(view.state)) return false;
            stopFormatPainter(view);
            return true;
          },
        },
        view: (view) => ({ destroy: attachMousePainting(view) }),
      }),
    ];
  },
});
