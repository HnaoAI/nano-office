// Insertion des images (T1.9) : point d'insertion entre deux blocs, insertion des images rangées et
// des fichiers préparés, contexte (bibliothèque, message) de chaque éditeur. Découpé de images.ts (M1),
// sans changement ; la préparation (réduction) est dans imageImport.ts.
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection, type EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { defaultAltText, IMAGE_NODE } from "../core/images";
import { prepareImage, type ImageRejection } from "./imageImport";
import type { ImageLibrary } from "./imageLibrary";

/**
 * Appelé quand des images sont refusées, pour afficher un message clair (critère 2) : une seule fois
 * par insertion, avec toutes les raisons, pour qu'aucune ne soit cachée par la suivante.
 */
export type ImageRejectedHandler = (reasons: ImageRejection[]) => void;

/** Bibliothèque et message d'erreur d'un éditeur, retrouvés par sa vue. */
export interface ImageContext {
  library: ImageLibrary;
  onRejected: ImageRejectedHandler;
}

/** Contexte de chaque vue, posé par le plugin des images (imagePaste.ts) tant que la vue existe. */
export const contexts = new WeakMap<EditorView, ImageContext>();

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
