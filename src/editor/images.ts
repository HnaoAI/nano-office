// Images dans l'éditeur (T1.9) : nœud image relié à la bibliothèque du document, insertion entre deux
// blocs (bouton, glisser-déposer, collage), texte de remplacement, image sélectionnée.
// La préparation (réduction) est dans imageImport.ts, l'affichage dans imageView.ts.
import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
} from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type * as Y from "yjs";
import { base64ToBytes } from "../core/base64";
import { defaultAltText, IMAGE_NODE } from "../core/images";
import { ImageNode } from "../core/imageSchema";
import { prepareImage, type ImageRejection } from "./imageImport";
import { ImageLibrary } from "./imageLibrary";
import { ImageView } from "./imageView";

/**
 * Appelé quand des images sont refusées, pour afficher un message clair (critère 2) : une seule fois
 * par insertion, avec toutes les raisons, pour qu'aucune ne soit cachée par la suivante.
 */
export type ImageRejectedHandler = (reasons: ImageRejection[]) => void;

/** Bibliothèque et message d'erreur d'un éditeur, retrouvés par sa vue. */
interface ImageContext {
  library: ImageLibrary;
  onRejected: ImageRejectedHandler;
}

const contexts = new WeakMap<EditorView, ImageContext>();

/** Une image prête à insérer. */
interface ImageToInsert {
  hash: string;
  alt: string;
}

/**
 * Position où insérer une image, entre deux blocs du document (critère 3) :
 * - curseur au début d'un paragraphe ou d'un titre : avant lui ; à la fin, ou dans un paragraphe vide : après lui,
 *   sauf le paragraphe vide, devant lequel l'image se place (le curseur reste sur la ligne vide) ;
 * - au milieu : le paragraphe est coupé en deux, l'image va entre les deux ;
 * - dans une liste ou un tableau : après la liste ou le tableau (pas d'image dans un tableau, hors périmètre) ;
 * - image sélectionnée : après elle.
 * @returns la position, et vrai s'il faut d'abord couper le bloc à cette position
 */
export function imageInsertPoint(state: EditorState): { pos: number; split: boolean } {
  const { selection } = state;
  if (selection instanceof NodeSelection && selection.$from.depth === 0) {
    return { pos: selection.to, split: false };
  }
  const $from = selection.$from;
  if ($from.depth === 0) return { pos: $from.pos, split: false };
  const top = $from.node(1);
  if ($from.depth === 1 && top.isTextblock) {
    if (top.content.size === 0 || $from.parentOffset === 0)
      return { pos: $from.before(1), split: false };
    if ($from.parentOffset === top.content.size) return { pos: $from.after(1), split: false };
    return { pos: $from.pos, split: true };
  }
  return { pos: $from.after(1), split: false };
}

/**
 * Insère des images déjà rangées, l'une après l'autre, au point du curseur, en une seule étape
 * d'annulation. Le curseur se place ensuite dans le bloc qui suit la dernière image ; un paragraphe
 * vide est ajouté si l'image termine le document, pour pouvoir continuer à écrire.
 */
export function insertImageNodes(view: EditorView, images: ImageToInsert[]): boolean {
  const type = view.state.schema.nodes[IMAGE_NODE];
  const paragraph = view.state.schema.nodes.paragraph;
  if (!type || !paragraph || images.length === 0) return false;
  const { pos, split } = imageInsertPoint(view.state);
  const tr = view.state.tr;
  let at = pos;
  if (split) {
    tr.split(pos);
    at = pos + 1;
  }
  const nodes: ProseMirrorNode[] = images.map(({ hash, alt }) => type.create({ hash, alt }));
  tr.insert(at, nodes);
  const after = at + nodes.reduce((size, node) => size + node.nodeSize, 0);
  if (after >= tr.doc.content.size) tr.insert(after, paragraph.create());
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(after + 1, tr.doc.content.size))));
  view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Prépare puis insère des fichiers choisis, déposés ou collés, dans l'ordre (critères 1 et 2).
 * Un fichier refusé affiche un message, les autres sont insérés quand même.
 * @param useFileNames vrai pour un fichier choisi ou déposé : son nom devient le texte de remplacement
 *   (critère 5) ; faux pour une image collée, dont le nom (« image.png ») est donné par le navigateur
 */
export async function insertImageFiles(
  view: EditorView,
  files: File[],
  useFileNames = true,
): Promise<void> {
  const context = contexts.get(view);
  if (!context) return;
  const ready: ImageToInsert[] = [];
  const rejections = new Set<ImageRejection>();
  for (const file of files) {
    const prepared = await prepareImage(file);
    if (prepared.ok) {
      ready.push({
        hash: context.library.store(prepared.image),
        alt: useFileNames ? defaultAltText(file.name) : "",
      });
    } else {
      rejections.add(prepared.reason);
    }
  }
  if (view.isDestroyed) return;
  if (rejections.size > 0) context.onRejected(Array.from(rejections));
  if (ready.length > 0) insertImageNodes(view, ready);
}

/** Insère des images depuis l'éditeur Tiptap (bouton « Insérer une image »). */
export function insertImagesFromPicker(editor: Editor, files: File[]): Promise<void> {
  return insertImageFiles(editor.view, files, true);
}

/** Image sélectionnée d'un clic, ou null. */
export function selectedImage(state: EditorState): { alt: string } | null {
  const { selection } = state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== IMAGE_NODE) return null;
  const alt: unknown = selection.node.attrs.alt;
  return { alt: typeof alt === "string" ? alt : "" };
}

/** Change le texte de remplacement de l'image sélectionnée (critère 5), en une étape d'annulation. */
export function setImageAlt(editor: Editor, alt: string): boolean {
  const { state } = editor;
  if (!selectedImage(state)) return false;
  const pos = state.selection.from;
  const tr = state.tr.setNodeAttribute(pos, "alt", alt.trim());
  tr.setSelection(NodeSelection.create(tr.doc, pos));
  editor.view.dispatch(tr);
  return true;
}

/** Fichiers d'une liste, dans l'ordre. */
function filesOf(list: FileList | null | undefined): File[] {
  return list ? Array.from(list) : [];
}

/** Vrai si le HTML collé ne contient que des images, sans texte (copie d'une image dans un navigateur). */
function htmlHasNoText(html: string): boolean {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").trim() === "";
}

/** Adresse `data:` d'une image en base64, décodée sans requête (critère 10), ou null. */
function dataUrlToBlob(src: string): Blob | null {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(src);
  if (!match?.[2] || match[3] === undefined) return null;
  try {
    return new Blob([base64ToBytes(match[3].replace(/\s/g, "")) as BlobPart]);
  } catch {
    return null;
  }
}

/**
 * Collage d'un HTML qui contient des images `data:` (copie depuis une autre fenêtre de Nano Buro ou
 * certaines pages) : chaque image est préparée et rangée, son `src` remplacé par son empreinte, puis le
 * HTML est collé. Une image refusée est retirée ; une image `http…` n'est jamais téléchargée (critère 10).
 */
async function pasteHtmlWithImages(view: EditorView, html: string): Promise<void> {
  const context = contexts.get(view);
  if (!context) return;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rejections = new Set<ImageRejection>();
  for (const img of Array.from(doc.querySelectorAll("img"))) {
    const src = img.getAttribute("src") ?? "";
    if (!src.startsWith("data:")) continue;
    const blob = dataUrlToBlob(src);
    const prepared = blob ? await prepareImage(blob) : null;
    if (prepared?.ok) {
      img.setAttribute("data-hash", context.library.store(prepared.image));
      img.removeAttribute("src");
    } else {
      rejections.add(prepared ? prepared.reason : "unreadable");
      img.remove();
    }
  }
  if (view.isDestroyed) return;
  if (rejections.size > 0) context.onRejected(Array.from(rejections));
  view.pasteHTML(doc.body.innerHTML);
}

/**
 * Vrai si le HTML contient une image `data:` que le document ne range pas encore (copie depuis une
 * autre fenêtre ou une autre application). Une image déjà rangée (copie dans le même document) est
 * lue directement par son empreinte.
 */
function hasNewDataImages(html: string, library: ImageLibrary): boolean {
  if (!/<img[^>]+src\s*=\s*["']?data:/i.test(html)) return false;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.querySelectorAll("img")).some((img) => {
    const hash = img.getAttribute("data-hash");
    return (img.getAttribute("src") ?? "").startsWith("data:") && !(hash && library.has(hash));
  });
}

/** Sélection de départ : le premier endroit où écrire du texte, jamais une image sélectionnée. */
function firstTextSelection(state: EditorState): TextSelection | null {
  const found = TextSelection.findFrom(state.doc.resolve(0), 1, true);
  return found instanceof TextSelection ? found : null;
}

/**
 * Plugin des images collées ou déposées :
 * - fichiers déposés : préparés et insérés à l'endroit du dépôt (critère 1) ; un déplacement d'image
 *   dans le document reste géré par ProseMirror ;
 * - fichiers collés sans texte (image copiée) : insérés au curseur ;
 * - HTML avec des images `data:` collé ou déposé : voir `pasteHtmlWithImages`. Le reste suit le
 *   collage habituel (src/editor/clipboard.ts), où les images `http…` sont ignorées ;
 * - Ctrl/Cmd+Shift+V colle toujours du texte brut, sans image (T1.5, critère 3).
 * Il veille aussi à ce qu'un document qui commence par une image s'ouvre avec le curseur dans le
 * premier texte, et non avec l'image sélectionnée : la première touche la remplacerait (relecture du lot D).
 */
function createImagePlugin(context: ImageContext): Plugin {
  // Vrai après la première touche ou le premier clic : la sélection est alors celle de l'utilisateur.
  let interacted = false;
  let plainPaste = false;
  return new Plugin({
    key: new PluginKey("nanoImages"),
    appendTransaction(_transactions, _oldState, state) {
      if (interacted || !(state.selection instanceof NodeSelection)) return null;
      const selection = firstTextSelection(state);
      return selection ? state.tr.setSelection(selection).setMeta("addToHistory", false) : null;
    },
    view(view) {
      contexts.set(view, context);
      context.library.attach();
      return {
        destroy() {
          contexts.delete(view);
          context.library.detach();
        },
      };
    },
    props: {
      handleDOMEvents: {
        mousedown() {
          interacted = true;
          return false;
        },
        keydown(_view, event) {
          interacted = true;
          plainPaste = event.shiftKey && (event.ctrlKey || event.metaKey) && event.code === "KeyV";
          return false;
        },
      },
      handlePaste(view, event) {
        const plain = plainPaste;
        plainPaste = false;
        const data = event.clipboardData;
        if (!data || plain) return false;
        const html = data.getData("text/html");
        const files = filesOf(data.files);
        if (files.length > 0 && (!html || htmlHasNoText(html))) {
          void insertImageFiles(view, files, false);
          return true;
        }
        if (html && hasNewDataImages(html, context.library)) {
          void pasteHtmlWithImages(view, html);
          return true;
        }
        return false;
      },
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const files = filesOf(event.dataTransfer?.files);
        const html = event.dataTransfer?.getData("text/html") ?? "";
        const withImages =
          files.length === 0 && html !== "" && hasNewDataImages(html, context.library);
        if (files.length === 0 && !withImages) return false;
        const target = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (target) {
          const $pos = view.state.doc.resolve(target.pos);
          view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)));
        }
        void (withImages ? pasteHtmlWithImages(view, html) : insertImageFiles(view, files, true));
        return true;
      },
    },
  });
}

/**
 * Extensions des images d'un éditeur : le nœud image du schéma, affiché par `ImageView` et copié avec
 * son contenu en `data:`, et le plugin du collage et du dépôt.
 * @param ydoc Y.Doc du document, qui range les images (critère 8)
 * @param onRejected affiche le message d'une image refusée
 */
export function createImageExtensions(ydoc: Y.Doc, onRejected: ImageRejectedHandler) {
  const library = new ImageLibrary(ydoc);
  const context: ImageContext = { library, onRejected };
  const node = ImageNode.extend({
    addNodeView() {
      return ({ node: current, view, getPos }) =>
        new ImageView(current, view, getPos as () => number | undefined, library);
    },
  }).configure({ imageSource: (hash) => library.dataUrl(hash) });
  const plugin = Extension.create({
    name: "nanoImages",
    addProseMirrorPlugins: () => [createImagePlugin(context)],
  });
  return { node, plugin };
}
