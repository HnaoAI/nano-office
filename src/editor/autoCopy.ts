// Copie automatique de la sélection faite à la souris (T2.21) : quand le bouton est lâché sur une
// sélection non vide du document, elle est copiée comme avec Ctrl/Cmd+C, par le même chemin
// (événement `copy` de ProseMirror et sérialiseur de clipboard.ts). Sans React.
// INVARIANT : la copie ne crée aucune transaction : le document, l'historique d'annulation et
// l'indicateur « Modifié » ne bougent pas (critère 5). Rien ne part sur le réseau (critère 8).
import { NodeSelection, type EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/** Champs où l'on tape du texte : un clic dedans ne copie jamais rien (critère 4). */
const FIELD_SELECTOR = "input, textarea, select, [contenteditable='true']";

/**
 * Vrai si la sélection de l'éditeur doit être copiée : non vide, et pas un objet choisi d'un simple
 * clic (image, schéma, saut de page, sommaire), qui ne « sélectionne » pas de texte (critère 2).
 * Une sélection de cellules d'un tableau est copiée.
 */
export function shouldAutoCopy(state: EditorState): boolean {
  const { selection } = state;
  return !selection.empty && !(selection instanceof NodeSelection);
}

/** Vrai si un clic part d'un champ posé dans le document (texte d'une forme de schéma, par exemple). */
function inField(view: EditorView, target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  const field = target.closest(FIELD_SELECTOR);
  return field !== null && field !== view.dom;
}

/**
 * Copie par le presse-papiers asynchrone, quand Chrome refuse `execCommand` (glisser de plus de
 * 5 secondes : l'activation du clic a expiré). Même contenu que l'événement `copy` de ProseMirror :
 * `serializeForClipboard` passe par le même sérialiseur (clipboard.ts).
 */
function copyWithClipboardApi(view: EditorView): void {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return;
  const { dom, text } = view.serializeForClipboard(view.state.selection.content());
  const item = new ClipboardItem({
    "text/html": new Blob([dom.innerHTML], { type: "text/html" }),
    "text/plain": new Blob([text], { type: "text/plain" }),
  });
  // Accès refusé par le navigateur : rien ne casse, Ctrl/Cmd+C reste possible (critère 7).
  navigator.clipboard.write([item]).catch(() => undefined);
}

/** Copie la sélection de l'éditeur si elle doit l'être, sans jamais lever d'erreur (critère 7). */
function copySelection(view: EditorView): void {
  if (view.isDestroyed || !view.hasFocus() || !shouldAutoCopy(view.state)) return;
  if (document.activeElement !== view.dom) return;
  try {
    // Même chemin que Ctrl/Cmd+C : l'événement `copy` est traité par ProseMirror (critère 2).
    if (document.execCommand("copy")) return;
    copyWithClipboardApi(view);
  } catch {
    // Accès refusé : la sélection reste, rien d'autre ne change (critère 7).
  }
}

/**
 * Installe la copie automatique sur un éditeur. Seul un clic gauche commencé dans le texte du
 * document compte : une sélection au clavier (Shift+flèches, Ctrl/Cmd+A) n'est pas copiée
 * (critère 3), ni un clic dans un champ (critère 4). Le bouton peut être lâché hors de la page.
 * @returns la fonction qui retire la copie automatique (réglage décoché, éditeur détruit)
 */
export function attachAutoCopy(view: EditorView): () => void {
  let pressed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onMouseDown = (event: MouseEvent) => {
    pressed = event.button === 0 && !inField(view, event.target);
  };
  const onMouseUp = (event: MouseEvent) => {
    if (!pressed || event.button !== 0) return;
    pressed = false;
    // Une tâche plus tard : ProseMirror a lu la sélection du navigateur (glisser, double clic).
    clearTimeout(timer);
    timer = setTimeout(() => copySelection(view), 0);
  };
  view.dom.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp, true);
  return () => {
    clearTimeout(timer);
    view.dom.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mouseup", onMouseUp, true);
  };
}
