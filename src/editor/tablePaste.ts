// Tableaux collés depuis une autre application (T1.8, critère 7) : les cellules fusionnées sont
// séparées dans le HTML, avant sa lecture par le schéma, car la fusion est hors périmètre.
// Appelé par src/editor/clipboard.ts. Sans React ; travaille sur le DOM du HTML collé.

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
