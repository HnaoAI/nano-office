// Outils des tests d'interface des tableaux (T1.8) : lire les cellules, insérer par la grille, lire
// les identifiants des cellules du Y.Doc.
import { expect, type Page } from "@playwright/test";
import type { DocumentJson } from "../../src/core/types";
import { button, editor, ydocJson } from "./formatHelpers";

/** Textes des cellules de chaque ligne du premier tableau affiché. */
export function tableText(page: Page) {
  return editor(page)
    .locator("table")
    .first()
    .evaluate((table: HTMLTableElement) =>
      Array.from(table.rows, (row) => Array.from(row.cells, (cell) => cell.textContent ?? "")),
    );
}

/** Insère un tableau par la grille, à la souris. */
export async function insertTable(page: Page, rows: number, cols: number) {
  await button(page, "Insérer un tableau").click();
  const name = `${String(rows)} ligne${rows > 1 ? "s" : ""}, ${String(cols)} colonne${cols > 1 ? "s" : ""}`;
  const cell = page.getByRole("group", { name: "Taille du tableau" }).getByRole("button", { name });
  await cell.hover();
  await expect(page.locator(".nano-table-size")).toHaveText(`${String(rows)} × ${String(cols)}`);
  await cell.click();
}

/** Identifiants des cellules du Y.Doc, dans l'ordre. */
export async function cellIds(page: Page): Promise<unknown[]> {
  const ids: unknown[] = [];
  const visit = (node: DocumentJson) => {
    if (node.type === "tableCell" || node.type === "tableHeader") ids.push(node.attrs?.id);
    node.content?.forEach(visit);
  };
  visit(await ydocJson(page));
  return ids;
}
