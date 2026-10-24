// Plan du document dans l'éditeur (T2.9) : aller à un titre sous la barre figée, déplacer une partie
// entière en une étape d'annulation, à la souris ou au clavier. Le calcul des parties est dans
// src/core/outline.ts ; ce fichier ne fait que l'appliquer à l'éditeur.
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import {
  canMoveSection,
  moveSection,
  neighbourTarget,
  sectionRange,
  topBlockPos,
  type OutlineEntry,
} from "../core/outline";
import { BLOCK_ID_ATTRIBUTE } from "../core/schema";
import { dispatchAsOneStep } from "./assistantEdits";

/** Espace laissé entre la barre figée et le titre atteint, en pixels, comme pour le curseur (M1). */
const GAP_BELOW_BAR = 16;

/** Une ligne du plan à retrouver dans le document : son identifiant, ou sa place. */
type EntryRef = Pick<OutlineEntry, "id" | "index">;

/** Où poser une partie : avant une ligne du plan, ou à la fin du document (null). */
export type DropBefore = EntryRef | null;

function targetPos(editor: Editor, before: DropBefore): number | null {
  const { doc } = editor.state;
  return before === null ? doc.content.size : topBlockPos(doc, before);
}

/**
 * Fait défiler la fenêtre pour que le bloc placé en `pos` apparaisse en haut, juste sous la partie
 * figée (critère 3, M1).
 * @param coveredTop hauteur cachée en haut de la fenêtre par la partie figée, en pixels
 */
function scrollBlockToTop(editor: Editor, pos: number, coveredTop: () => number): void {
  const element = editor.view.nodeDOM(pos);
  if (!(element instanceof HTMLElement)) return;
  const top = element.getBoundingClientRect().top - coveredTop() - GAP_BELOW_BAR;
  window.scrollBy({ top, behavior: "instant" });
}

/**
 * Amène le curseur au début d'un titre et fait défiler la page sous la barre figée (critère 3).
 * Ne modifie pas le document.
 * @returns faux si le titre n'existe plus
 */
export function goToHeading(editor: Editor, entry: EntryRef, coveredTop: () => number): boolean {
  const pos = topBlockPos(editor.state.doc, entry);
  if (pos === null) return false;
  const { tr } = editor.state;
  tr.setSelection(TextSelection.create(tr.doc, pos + 1));
  editor.view.dispatch(tr);
  editor.view.focus();
  scrollBlockToTop(editor, pos, coveredTop);
  return true;
}

/**
 * Vrai si la partie du titre `entry` peut être posée avant `before` : pas sur place ni à l'intérieur
 * d'elle-même. Sert au trait de dépôt (critère 4).
 */
export function canDropSection(editor: Editor, entry: EntryRef, before: DropBefore): boolean {
  const { doc } = editor.state;
  const pos = topBlockPos(doc, entry);
  const range = pos === null ? null : sectionRange(doc, pos);
  const target = targetPos(editor, before);
  return range !== null && target !== null && canMoveSection(range, target);
}

/** Déplace une partie en `target`, en une étape d'annulation, et place le curseur au début de son titre. */
function moveTo(editor: Editor, from: number, target: number | null): boolean {
  if (target === null) return false;
  const range = sectionRange(editor.state.doc, from);
  if (!range) return false;
  const { tr } = editor.state;
  const at = moveSection(tr, range, target);
  if (at === null) return false;
  tr.setSelection(TextSelection.create(tr.doc, at + 1));
  // Une seule étape d'annulation, isolée de la frappe : un Ctrl/Cmd+Z remet tout en place (critère 5).
  dispatchAsOneStep(editor, tr.scrollIntoView());
  return true;
}

/**
 * Déplace la partie du titre `entry` avant la ligne `before` du plan, ou à la fin (critère 4). Les blocs
 * gardent leurs identifiants (critère 6).
 * @returns faux si rien n'a bougé (sur place, dans la partie elle-même, titre disparu)
 */
export function moveSectionBefore(editor: Editor, entry: EntryRef, before: DropBefore): boolean {
  const from = topBlockPos(editor.state.doc, entry);
  return from !== null && moveTo(editor, from, targetPos(editor, before));
}

/**
 * Fait passer la partie du titre `entry` avant la partie précédente ou après la suivante, de même niveau
 * (Alt+Shift+Flèche, critère 4).
 * @returns faux si elle est déjà la première ou la dernière de son niveau
 */
export function moveSectionStep(
  editor: Editor,
  entry: EntryRef,
  direction: "up" | "down",
): boolean {
  const { doc } = editor.state;
  const from = topBlockPos(doc, entry);
  const range = from === null ? null : sectionRange(doc, from);
  if (from === null || !range) return false;
  return moveTo(editor, from, neighbourTarget(doc, range, direction));
}

/**
 * Titre de premier niveau où se trouve le curseur, pour le déplacer au clavier depuis le document, ou
 * null si le curseur n'est pas dans un titre.
 */
export function headingAtCursor(editor: Editor): EntryRef | null {
  const { $from } = editor.state.selection;
  if ($from.depth !== 1 || $from.parent.type.name !== "heading") return null;
  const id: unknown = $from.parent.attrs[BLOCK_ID_ATTRIBUTE];
  return { id: typeof id === "string" && id !== "" ? id : null, index: $from.index(0) };
}
