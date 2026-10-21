// Tableaux dans l'éditeur (T1.8) : insertion depuis la grille, état du curseur pour la barre (dans un
// tableau, ligne d'en-tête), et de quoi écrire avant ou après un tableau (curseur entre deux blocs,
// paragraphe toujours présent après un tableau qui finit le document).
// Les commandes de lignes et de colonnes sont celles de @tiptap/extension-table (prosemirror-tables).
import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { gapCursor } from "@tiptap/pm/gapcursor";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { isInTable as cursorInTable, selectedRect } from "@tiptap/pm/tables";

/** Vrai si le curseur (ou la sélection de cellules) est dans un tableau. */
export function isInTable(state: EditorState): boolean {
  return cursorInTable(state);
}

/** Tableau qui contient le curseur, et sa position, ou null. */
function tableAround(state: EditorState): { node: ProseMirrorNode; pos: number } | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === "table") return { node, pos: $from.before(depth) };
  }
  return null;
}

/** Vrai si la première ligne du tableau du curseur est une ligne d'en-tête (bouton « Ligne d'en-tête »). */
export function headerRowActive(state: EditorState): boolean {
  const firstRow = tableAround(state)?.node.firstChild;
  if (!firstRow || firstRow.childCount === 0) return false;
  let allHeaders = true;
  firstRow.forEach((cell) => {
    if (cell.type.name !== "tableHeader") allHeaders = false;
  });
  return allHeaders;
}

/**
 * Lignes et colonnes que « Supprimer la ligne » et « Supprimer la colonne » peuvent retirer : pas
 * toutes celles du tableau (prosemirror-tables refuse alors sans rien dire, et `can()` de Tiptap ne
 * le voit pas, car la vérification n'a lieu qu'à l'exécution).
 */
export function tableDeletions(state: EditorState): { row: boolean; column: boolean } {
  if (!isInTable(state)) return { row: false, column: false };
  const rect = selectedRect(state);
  return {
    row: !(rect.top === 0 && rect.bottom === rect.map.height),
    column: !(rect.left === 0 && rect.right === rect.map.width),
  };
}

/**
 * Insère un tableau de `rows` lignes et `cols` colonnes, dont la première ligne est l'en-tête
 * (critère 1), en une seule étape d'annulation.
 * @returns faux, sans rien changer, si le curseur est déjà dans un tableau (critère 4)
 */
export function insertTable(editor: Editor, rows: number, cols: number): boolean {
  if (isInTable(editor.state)) return false;
  return editor.commands.insertTable({ rows, cols, withHeaderRow: true });
}

/**
 * Ajoute un paragraphe vide quand le document finit par un tableau (insertion, collage, suppression
 * du dernier paragraphe), pour qu'on puisse toujours écrire après, comme dans Word. Les transactions
 * qui suivent un chargement par Yjs ne comptent pas comme une modification (src/editor/userEdits.ts).
 */
function createTrailingParagraphPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey("tableTrailingParagraph"),
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      const { doc, schema } = newState;
      const paragraph = schema.nodes.paragraph;
      if (doc.lastChild?.type.name !== "table" || !paragraph) return null;
      const tr = newState.tr.insert(doc.content.size, paragraph.create());
      if (newState.storedMarks) tr.setStoredMarks(newState.storedMarks);
      // Le paragraphe suit la modification qui l'a rendu nécessaire, dans la même étape d'annulation.
      if (transactions.every((change) => change.getMeta("addToHistory") === false)) {
        tr.setMeta("addToHistory", false);
      }
      return tr;
    },
  });
}

/**
 * Curseur entre deux blocs (prosemirror-gapcursor, licence MIT), pour écrire avant un tableau qui
 * commence le document, et paragraphe toujours présent après un tableau qui le termine.
 */
export const TableNavigation = Extension.create({
  name: "tableNavigation",
  addProseMirrorPlugins() {
    return [gapCursor(), createTrailingParagraphPlugin()];
  },
});
