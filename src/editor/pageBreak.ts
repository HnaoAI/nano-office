// Saut de page manuel dans l'éditeur (T2.8, critères 6 à 8) : insertion au curseur (Ctrl/Cmd+Entrée et
// bouton de la barre), en une étape d'annulation, et paragraphe toujours présent après un saut de page
// qui termine le document. Le nœud est défini dans src/core/pageBreakSchema.ts.
import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, TextSelection, type Selection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { PAGE_BREAK_NODE } from "../core/pageBreakSchema";
import { dispatchAsOneStep } from "./assistantEdits";

/**
 * Où placer un saut de page, comme dans Word :
 * - `before` : au début d'un paragraphe (ou dans un paragraphe vide), le paragraphe passe à la page suivante ;
 * - `split` : au milieu, le paragraphe est coupé et sa fin passe à la page suivante ;
 * - `after` : à la fin d'un paragraphe, après une liste, un tableau ou un bloc sélectionné, un paragraphe
 *   vide commence la page suivante.
 * Un saut de page n'entre jamais dans une liste ni dans un tableau : il se place après eux.
 */
export function pageBreakInsertPoint(selection: Selection): {
  pos: number;
  mode: "before" | "split" | "after";
} {
  if (selection instanceof NodeSelection && selection.$from.depth === 0) {
    return { pos: selection.to, mode: "after" };
  }
  const { $from } = selection;
  // Curseur entre deux blocs (gapcursor) : le saut de page se place là.
  if ($from.depth === 0) return { pos: $from.pos, mode: "after" };
  const top = $from.node(1);
  if ($from.depth === 1 && top.isTextblock) {
    if (top.content.size === 0 || $from.parentOffset === 0) {
      return { pos: $from.before(1), mode: "before" };
    }
    if ($from.parentOffset === top.content.size) return { pos: $from.after(1), mode: "after" };
    return { pos: $from.pos, mode: "split" };
  }
  return { pos: $from.after(1), mode: "after" };
}

/**
 * Insère un saut de page au curseur (critère 6), en une seule étape d'annulation qui ne se fond pas avec la
 * frappe (critère 7). Un texte sélectionné est remplacé, comme dans Word ; des cellules sélectionnées ne
 * sont jamais effacées. Le curseur se place au début de
 * la nouvelle page.
 * @returns faux si le schéma n'a pas de saut de page
 */
export function insertPageBreak(editor: Editor): boolean {
  const { state } = editor;
  const type = state.schema.nodes[PAGE_BREAK_NODE];
  const paragraph = state.schema.nodes.paragraph;
  if (!type || !paragraph) return false;
  const tr = state.tr;
  // Cellules sélectionnées : rien n'est effacé, le saut de page se place après le tableau.
  const replaces =
    !state.selection.empty &&
    !(state.selection instanceof NodeSelection) &&
    !(state.selection instanceof CellSelection);
  if (replaces) tr.deleteSelection();
  const { pos, mode } = pageBreakInsertPoint(tr.selection);
  const pageBreak = type.create();
  let cursor: number;
  if (mode === "split") {
    tr.split(pos);
    tr.insert(pos + 1, pageBreak);
    cursor = pos + 1 + pageBreak.nodeSize + 1;
  } else if (mode === "before") {
    tr.insert(pos, pageBreak);
    cursor = pos + pageBreak.nodeSize + 1;
  } else {
    tr.insert(pos, [pageBreak, paragraph.create()]);
    cursor = pos + pageBreak.nodeSize + 1;
  }
  tr.setSelection(TextSelection.create(tr.doc, cursor));
  dispatchAsOneStep(editor, tr.scrollIntoView());
  return true;
}

/** Vrai si le nœud est un saut de page. */
export function isPageBreak(node: ProseMirrorNode | null | undefined): boolean {
  return node?.type.name === PAGE_BREAK_NODE;
}

/**
 * Ajoute un paragraphe vide quand le document finit par un saut de page (suppression du dernier
 * paragraphe, collage), pour pouvoir toujours écrire sur la nouvelle page, comme après un tableau (T1.8).
 */
function createTrailingParagraphPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey("pageBreakTrailingParagraph"),
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      const { doc, schema } = newState;
      const paragraph = schema.nodes.paragraph;
      if (!isPageBreak(doc.lastChild) || !paragraph) return null;
      const tr = newState.tr.insert(doc.content.size, paragraph.create());
      if (transactions.every((change) => change.getMeta("addToHistory") === false)) {
        tr.setMeta("addToHistory", false);
      }
      return tr;
    },
  });
}

/** Extension des sauts de page : paragraphe après un saut de page final. */
export const PageBreaks = Extension.create({
  name: "pageBreaks",
  addProseMirrorPlugins() {
    return [createTrailingParagraphPlugin()];
  },
});
