// Tableaux dans le copier-coller (T1.8) : cellules fusionnées séparées et tableaux imbriqués aplatis
// dans le HTML collé (critères 4 et 7), tableau collé dans une cellule mis à plat (aucune cellule
// écrasée), bordures en style dans le HTML copié pour un e-mail (critère 8).
// Appelé par src/editor/clipboard.ts. Sans React.
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";

/** Nombre entier positif d'un attribut `colspan` ou `rowspan`, 1 par défaut. */
function span(element: Element, name: string): number {
  const value = Number.parseInt(element.getAttribute(name) ?? "1", 10);
  return Number.isFinite(value) && value > 1 ? Math.min(value, 100) : 1;
}

/** Cellule vide du même type (`td` ou `th`) qu'une cellule fusionnée. */
function emptyCellLike(cell: Element): HTMLElement {
  return cell.ownerDocument.createElement(cell.tagName.toLowerCase());
}

/**
 * Sépare toutes les cellules fusionnées des tableaux de `body` : une cellule qui couvre plusieurs
 * lignes ou colonnes garde son contenu dans la première case, et les autres cases deviennent des
 * cellules vides. Chaque ligne a ensuite autant de cellules que de colonnes couvertes.
 */
export function splitMergedCells(body: HTMLElement): void {
  for (const table of Array.from(body.querySelectorAll("table"))) {
    if (!table.querySelector("[colspan], [rowspan]")) continue;
    const rows = Array.from(table.rows);
    // grid[ligne][colonne] : la cellule d'origine, et si elle commence à cette case.
    const grid: { cell: HTMLTableCellElement; origin: boolean }[][] = rows.map(() => []);
    rows.forEach((row, rowIndex) => {
      let column = 0;
      for (const cell of Array.from(row.cells)) {
        const line = grid[rowIndex] ?? [];
        while (line[column]) column++;
        const colspan = span(cell, "colspan");
        const rowspan = Math.min(span(cell, "rowspan"), rows.length - rowIndex);
        for (let r = 0; r < rowspan; r++) {
          for (let c = 0; c < colspan; c++) {
            const target = grid[rowIndex + r];
            if (target) target[column + c] = { cell, origin: r === 0 && c === 0 };
          }
        }
        column += colspan;
      }
    });
    rows.forEach((row, rowIndex) => {
      // Array.from remplit les cases manquantes (ligne plus courte que les autres) par undefined.
      const cells = Array.from(grid[rowIndex] ?? [], (slot) => {
        if (!slot) return table.ownerDocument.createElement("td");
        if (!slot.origin) return emptyCellLike(slot.cell);
        slot.cell.removeAttribute("colspan");
        slot.cell.removeAttribute("rowspan");
        return slot.cell;
      });
      row.replaceChildren(...cells);
    });
  }
}

/**
 * Remplace chaque tableau placé dans une cellule (tableau de mise en page d'une page web) par le
 * contenu de ses cellules, l'une après l'autre : le tableau extérieur reste entier (critères 4 et 7).
 */
export function flattenNestedTables(body: HTMLElement): void {
  // Du plus profond au moins profond : querySelectorAll rend l'ordre du document.
  const nested = Array.from(body.querySelectorAll("td table, th table")).reverse();
  for (const table of nested) {
    const doc = table.ownerDocument;
    const blocks = Array.from(table.querySelectorAll("td, th")).map((cell) => {
      const block = doc.createElement("div");
      block.append(...Array.from(cell.childNodes));
      return block;
    });
    table.replaceWith(...blocks);
  }
}

/** Contenu d'un fragment, chaque tableau remplacé par les blocs de ses cellules. */
function withoutTables(fragment: Fragment): Fragment {
  const nodes: ProseMirrorNode[] = [];
  fragment.forEach((node) => {
    if (node.type.name !== "table") {
      nodes.push(node.isTextblock ? node : node.copy(withoutTables(node.content)));
      return;
    }
    node.forEach((row) => row.forEach((cell) => cell.forEach((block) => nodes.push(block))));
  });
  return Fragment.from(nodes);
}

/** Vrai si le fragment contient un tableau, à n'importe quelle profondeur. */
function containsTable(fragment: Fragment): boolean {
  let found = false;
  fragment.descendants((node) => {
    if (node.type.name === "table") found = true;
    return !found;
  });
  return found;
}

/**
 * Collage avec le curseur dans une cellule : un tableau collé devient ses textes, en paragraphes.
 * Sans cela, prosemirror-tables écraserait les cellules voisines avec celles du tableau collé, ou
 * couperait le tableau de l'utilisateur en deux (relecture du lot C). Une sélection de cellules
 * (à la souris) garde le collage cellule par cellule de prosemirror-tables, choisi exprès.
 */
export function flattenTablesForCell(slice: Slice): Slice {
  if (!containsTable(slice.content)) return slice;
  const content = withoutTables(slice.content);
  const openStart = slice.content.firstChild?.type.name === "table" ? 0 : slice.openStart;
  const openEnd = slice.content.lastChild?.type.name === "table" ? 0 : slice.openEnd;
  return new Slice(content, Math.min(openStart, 1), Math.min(openEnd, 1));
}

/**
 * Style en ligne des tableaux copiés, pour qu'un e-mail (Gmail, Outlook) montre la grille : il ne
 * lit pas tables.css. Couleur de bordure : le séparateur fort de la charte (#D4D4D1).
 */
export function addTableBordersForEmail(root: HTMLElement | DocumentFragment): void {
  for (const table of Array.from(root.querySelectorAll("table"))) {
    table.style.borderCollapse = "collapse";
    table.style.width = "100%";
  }
  for (const cell of Array.from(root.querySelectorAll<HTMLElement>("td, th"))) {
    cell.style.border = "1px solid #D4D4D1";
    cell.style.padding = "4px 8px";
    cell.style.verticalAlign = "top";
  }
}
