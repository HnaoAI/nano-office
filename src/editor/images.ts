// Images dans l'éditeur (T1.9) : nœud image relié à la bibliothèque du document, bouton « Insérer une
// image », texte de remplacement, image sélectionnée. Depuis M1, l'insertion est dans imageInsert.ts,
// le collage et le dépôt dans imagePaste.ts ; la préparation (réduction) est dans imageImport.ts,
// l'affichage dans imageView.ts.
import { Extension, type Editor } from "@tiptap/core";
import { NodeSelection, type EditorState } from "@tiptap/pm/state";
import type * as Y from "yjs";
import { IMAGE_NODE } from "../core/images";
import { ImageNode } from "../core/imageSchema";
import { insertImageFiles, type ImageContext, type ImageRejectedHandler } from "./imageInsert";
import { ImageLibrary } from "./imageLibrary";
import { createImagePlugin } from "./imagePaste";
import { ImageView } from "./imageView";

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
