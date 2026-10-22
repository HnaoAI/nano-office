// Collage et glisser-déposer des images (T1.9) : fichiers déposés ou collés, HTML avec des images
// `data:`, texte brut avec Ctrl/Cmd+Shift+V, curseur dans le premier texte à l'ouverture.
// Découpé de images.ts (M1), sans changement ; l'insertion est dans imageInsert.ts.
import {
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
} from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { base64ToBytes } from "../core/base64";
import { prepareImage, type ImageRejection } from "./imageImport";
import { contexts, insertImageFiles, type ImageContext } from "./imageInsert";
import type { ImageLibrary } from "./imageLibrary";

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
export function createImagePlugin(context: ImageContext): Plugin {
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
