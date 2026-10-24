// Encadrés dans l'éditeur (T2.19) : encadrer les paragraphes sélectionnés, changer le style, retirer l'encadré en
// rendant les paragraphes tels quels, chacun en une étape d'annulation, et sortir de l'encadré par Entrée sur une
// ligne vide en fin d'encadré, comme dans une liste. Le nœud est dans src/core/calloutSchema.ts.
import { Extension, type Editor } from "@tiptap/core";
import { NodeRange, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { splitBlockAs } from "@tiptap/pm/commands";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { BLOCK_ID_ATTRIBUTE } from "../core/schema";
import { CALLOUT_NODE, calloutStyle, type CalloutStyle } from "../core/calloutSchema";

/** L'encadré qui contient le curseur : sa position et son nœud. */
export interface CalloutAt {
  pos: number;
  node: ProseMirrorNode;
}

/** Encadré qui contient le début de la sélection, ou null. */
export function currentCallout(state: EditorState): CalloutAt | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === CALLOUT_NODE) return { pos: $from.before(depth), node };
  }
  // L'encadré lui-même sélectionné (sélection de nœud).
  const after = $from.nodeAfter;
  return state.selection.from + (after?.nodeSize ?? 0) === state.selection.to &&
    after?.type.name === CALLOUT_NODE
    ? { pos: $from.pos, node: after }
    : null;
}

/** Plage des blocs de premier niveau couverts par la sélection, si tous peuvent aller dans un encadré. */
function wrapRange(state: EditorState): NodeRange | null {
  const type = state.schema.nodes[CALLOUT_NODE];
  if (!type) return null;
  const { $from, $to } = state.selection;
  const range = $from.blockRange($to, (node) => node.type === state.doc.type);
  if (!range) return null;
  // Un tableau, un saut de page ou un autre encadré n'entrent jamais dans un encadré (critère 3).
  const content = state.doc.slice(range.start, range.end).content;
  return type.validContent(content) ? range : null;
}

/** Vrai si la sélection peut être encadrée (pas dans un tableau, pas de saut de page, pas déjà encadrée). */
export function canWrapInCallout(state: EditorState): boolean {
  return currentCallout(state) === null && wrapRange(state) !== null;
}

/**
 * Encadre les paragraphes, titres, listes et images sélectionnés (critère 1), ou change le style de l'encadré du
 * curseur (critère 2), en une étape d'annulation.
 * @returns faux si rien ne peut être encadré (tableau ou saut de page dans la sélection)
 */
export function setCallout(editor: Editor, style: CalloutStyle): boolean {
  const { state } = editor;
  const existing = currentCallout(state);
  if (existing) {
    if (calloutStyle(existing.node.attrs.calloutStyle) === style) return true;
    editor.view.dispatch(state.tr.setNodeAttribute(existing.pos, "calloutStyle", style));
    return true;
  }
  const range = wrapRange(state);
  const type = state.schema.nodes[CALLOUT_NODE];
  if (!range || !type) return false;
  editor.view.dispatch(
    state.tr.wrap(range, [{ type, attrs: { calloutStyle: style } }]).scrollIntoView(),
  );
  return true;
}

/** Transaction qui retire l'encadré à la position donnée et rend ses blocs tels quels, au même endroit. */
function unwrapTransaction(state: EditorState, callout: CalloutAt): Transaction {
  const start = state.doc.resolve(callout.pos + 1);
  const end = state.doc.resolve(callout.pos + callout.node.nodeSize - 1);
  const range = new NodeRange(start, end, start.depth);
  return state.tr.lift(range, start.depth - 1);
}

/** Retire l'encadré du curseur : ses paragraphes restent tels quels (critère 1), en une étape d'annulation. */
export function removeCallout(editor: Editor): boolean {
  const callout = currentCallout(editor.state);
  if (!callout) return false;
  editor.view.dispatch(unwrapTransaction(editor.state, callout).scrollIntoView());
  return true;
}

/**
 * Entrée sur une ligne vide en fin d'encadré (critère 3) : la ligne vide passe sous l'encadré, et le curseur avec
 * elle. La première Entrée a créé la ligne vide ; la seconde sort, comme dans une liste. Dans une liste de
 * l'encadré, Entrée reste celle de la liste.
 * @returns vrai si la touche a été traitée
 */
export function exitCalloutOnEnter(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const { $from, empty } = state.selection;
  if (!empty || $from.depth < 2) return false;
  const paragraph = $from.parent;
  const callout = $from.node(-1);
  if (
    callout.type.name !== CALLOUT_NODE ||
    paragraph.type.name !== "paragraph" ||
    paragraph.content.size > 0
  ) {
    return false;
  }
  // Ligne vide au début ou au milieu : une ligne de plus, dans l'encadré. Sans cela, l'Entrée par défaut de
  // ProseMirror (`liftEmptyBlock`) sortirait la ligne et couperait l'encadré en deux. La nouvelle ligne garde le
  // retrait, l'interligne et l'alignement, comme Entrée ailleurs (T2.14), avec un nouvel identifiant.
  if ($from.index(-1) !== callout.childCount - 1) {
    const attrs = { ...paragraph.attrs, [BLOCK_ID_ATTRIBUTE]: null };
    return splitBlockAs(() => ({ type: paragraph.type, attrs }))(state, dispatch);
  }
  if (!dispatch) return true;
  const calloutPos = $from.before(-1);
  if (callout.childCount === 1) {
    dispatch(unwrapTransaction(state, { pos: calloutPos, node: callout }).scrollIntoView());
    return true;
  }
  const lineStart = $from.before();
  const tr = state.tr.delete(lineStart, $from.after());
  const after = tr.mapping.map(calloutPos + callout.nodeSize);
  tr.insert(after, paragraph.type.create(paragraph.attrs));
  tr.setSelection(TextSelection.create(tr.doc, after + 1));
  dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Raccourcis de l'encadré : Entrée pour en sortir. Priorité haute, pour passer avant l'Entrée par défaut ; dans une
 * liste, `exitCalloutOnEnter` laisse la touche à la liste.
 */
export const CalloutKeys = Extension.create({
  name: "calloutKeys",
  priority: 900,
  addKeyboardShortcuts() {
    return {
      Enter: () => exitCalloutOnEnter(this.editor.state, this.editor.view.dispatch),
    };
  },
});
