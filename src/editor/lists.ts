// Listes à puces et numérotées (T1.2) : type de la liste du curseur, décalage limité à trois niveaux.
// S'appuie sur les commandes de listes de Tiptap (toggleBulletList, sinkListItem, liftListItem).
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { MAX_LIST_DEPTH } from "../core/schema";

/** Type d'une liste : à puces ou numérotée. */
export type ListType = "bulletList" | "orderedList";

/**
 * Type de la liste la plus proche du curseur, ou null hors d'une liste. C'est elle que les boutons
 * et les raccourcis transforment (comme `toggleBulletList` de Tiptap).
 */
export function currentListType(state: EditorState): ListType | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = $from.node(depth).type.name;
    if (name === "bulletList" || name === "orderedList") return name;
  }
  return null;
}

/** Nombre de niveaux d'éléments de liste contenus dans `node`, lui compris s'il en est un. */
function listItemHeight(node: ProseMirrorNode): number {
  let below = 0;
  node.forEach((child) => {
    below = Math.max(below, listItemHeight(child));
  });
  return below + (node.type.name === "listItem" ? 1 : 0);
}

/**
 * Niveau le plus profond qu'atteindraient les éléments décalés par Tab, sous-listes comprises :
 * 0 hors liste. Un élément qui contient des sous-points les entraîne avec lui (T1.2, critère 5).
 */
export function selectionListDepth(state: EditorState): number {
  const { $from, $to } = state.selection;
  const range = $from.blockRange($to, (node) => node.firstChild?.type.name === "listItem");
  if (!range) return 0;
  let level = 0;
  for (let d = range.depth; d > 0; d--) {
    if ($from.node(d).type.name === "listItem") level++;
  }
  let height = 0;
  for (let i = range.startIndex; i < range.endIndex; i++) {
    height = Math.max(height, listItemHeight(range.parent.child(i)));
  }
  return level + height;
}

/** Crée, change ou retire une liste du type donné (bouton ou raccourci, T1.2 critères 1 à 3 et 8). */
export function toggleList(editor: Editor, type: ListType): boolean {
  return type === "bulletList"
    ? editor.commands.toggleBulletList()
    : editor.commands.toggleOrderedList();
}

/**
 * Tab dans une liste : décale les éléments sélectionnés d'un niveau vers la droite, sauf si l'un
 * d'eux est déjà au niveau 3 (T1.2, critère 5).
 * @returns vrai si le curseur est dans une liste (la touche est alors consommée, même sans effet)
 */
export function indentListItem(editor: Editor): boolean {
  const depth = selectionListDepth(editor.state);
  if (depth === 0) return false;
  if (depth < MAX_LIST_DEPTH) editor.commands.sinkListItem("listItem");
  return true;
}

/**
 * Shift+Tab dans une liste : décale les éléments d'un niveau vers la gauche. Au premier niveau,
 * rien ne change : l'élément reste dans la liste (pour en sortir, Entrée sur un élément vide ou le
 * bouton de la liste).
 * @returns vrai si le curseur est dans une liste
 */
export function outdentListItem(editor: Editor): boolean {
  const { $from } = editor.state.selection;
  let depth = 0;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "listItem") depth++;
  }
  if (depth === 0) return false;
  if (depth > 1) editor.commands.liftListItem("listItem");
  return true;
}
