// Outils des tests de tableaux (T1.8) : cellule et tableau de budget d'exemple, lecture des tableaux
// d'un éditeur, placement du curseur.
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { DocumentJson } from "../../src/core/types";

export const cell = (
  type: "tableCell" | "tableHeader",
  id: string,
  text: string,
): DocumentJson => ({
  type,
  attrs: { id },
  content: [
    {
      type: "paragraph",
      attrs: { id: `${id}-p` },
      ...(text ? { content: [{ type: "text", text }] } : {}),
    },
  ],
});

/** Tableau de budget : une ligne d'en-tête et deux lignes. */
export const BUDGET: DocumentJson = {
  type: "doc",
  content: [
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [cell("tableHeader", "h-1", "Poste"), cell("tableHeader", "h-2", "Montant")],
        },
        {
          type: "tableRow",
          content: [cell("tableCell", "c-1", "Courses"), cell("tableCell", "c-2", "350 €")],
        },
        {
          type: "tableRow",
          content: [cell("tableCell", "c-3", "Électricité ⚡"), cell("tableCell", "c-4", "80 €")],
        },
      ],
    },
    { type: "paragraph", attrs: { id: "p-after" } },
  ],
};

/** Toutes les tables du document, chacune en lignes de textes de cellules. */
export function tables(target: Editor): string[][][] {
  const result: string[][][] = [];
  target.state.doc.descendants((node) => {
    if (node.type.name !== "table") return true;
    const rows: string[][] = [];
    node.forEach((row) => {
      const cells: string[] = [];
      row.forEach((c) => cells.push(c.textContent));
      rows.push(cells);
    });
    result.push(rows);
    return false;
  });
  return result;
}

/** Nombre de tableaux contenus dans un autre tableau. */
export function nestedTables(doc: ProseMirrorNode): number {
  let nested = 0;
  doc.descendants((node, _pos, parent) => {
    if (node.type.name === "table" && parent?.type.name !== "doc") nested++;
    return true;
  });
  return nested;
}

export function cellIds(target: Editor): unknown[] {
  const ids: unknown[] = [];
  target.state.doc.descendants((node) => {
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") ids.push(node.attrs.id);
    return true;
  });
  return ids;
}

/** Place le curseur dans le texte `text`. */
export function cursorIn(target: Editor, text: string): void {
  let found = -1;
  target.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(text)) found = pos + 1;
    return found < 0;
  });
  if (found < 0) throw new Error(`texte absent : ${text}`);
  target.commands.setTextSelection(found);
}
