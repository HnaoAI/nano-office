// Tests d'interface du ticket T1.8 (tableaux), dans Chromium.
import { expect, test, type Page } from "@playwright/test";
import { serializeDocument } from "../../src/core/fileFormat";
import type { DocumentJson } from "../../src/core/types";
import { ydocFromJson } from "../core/helpers";
import { setFakeFiles } from "./fakeFileStore";
import {
  button,
  editor,
  pasteFromOtherApp,
  readClipboard,
  saveAndReopen,
  settleSelection,
  start,
  ydocJson,
} from "./formatHelpers";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const TABLE_BUTTONS = [
  "Ajouter une ligne au-dessus",
  "Ajouter une ligne au-dessous",
  "Ajouter une colonne à gauche",
  "Ajouter une colonne à droite",
  "Supprimer la ligne",
  "Supprimer la colonne",
  "Supprimer le tableau",
  "Ligne d'en-tête",
];

/** Textes des cellules de chaque ligne du premier tableau affiché. */
function tableText(page: Page) {
  return editor(page)
    .locator("table")
    .first()
    .evaluate((table: HTMLTableElement) =>
      Array.from(table.rows, (row) => Array.from(row.cells, (cell) => cell.textContent ?? "")),
    );
}

/** Insère un tableau par la grille, à la souris. */
async function insertTable(page: Page, rows: number, cols: number) {
  await button(page, "Insérer un tableau").click();
  const name = `${String(rows)} ligne${rows > 1 ? "s" : ""}, ${String(cols)} colonne${cols > 1 ? "s" : ""}`;
  const cell = page.getByRole("group", { name: "Taille du tableau" }).getByRole("button", { name });
  await cell.hover();
  await expect(page.locator(".nano-table-size")).toHaveText(`${String(rows)} × ${String(cols)}`);
  await cell.click();
}

/** Identifiants des cellules du Y.Doc, dans l'ordre. */
async function cellIds(page: Page): Promise<unknown[]> {
  const ids: unknown[] = [];
  const visit = (node: DocumentJson) => {
    if (node.type === "tableCell" || node.type === "tableHeader") ids.push(node.attrs?.id);
    node.content?.forEach(visit);
  };
  visit(await ydocJson(page));
  return ids;
}

test("critère 1 : la grille de 8 × 8 cases insère le tableau choisi au survol, avec une ligne d'en-tête", async ({
  page,
}) => {
  await start(page);
  await button(page, "Insérer un tableau").click();
  await expect(
    page.getByRole("group", { name: "Taille du tableau" }).getByRole("button"),
  ).toHaveCount(64);
  await page.keyboard.press("Escape");
  await insertTable(page, 3, 4);
  await expect(page.getByRole("group", { name: "Taille du tableau" })).toBeHidden();
  const table = editor(page).locator("table");
  await expect(table.locator("tr")).toHaveCount(3);
  await expect(table.locator("tr").first().locator("th")).toHaveCount(4);
  await expect(table.locator("td")).toHaveCount(8);
});

test("critère 1 : la grille se parcourt au clavier, et Entrée insère le tableau", async ({
  page,
}) => {
  await start(page);
  await button(page, "Insérer un tableau").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".nano-table-size")).toHaveText("3 × 2");
  await page.keyboard.press("Enter");
  await expect(editor(page).locator("tr")).toHaveCount(3);
  await expect(editor(page).locator("tr").first().locator("th")).toHaveCount(2);
  await page.keyboard.type("Poste");
  expect((await tableText(page))[0]).toEqual(["Poste", ""]);
});

test("critère 2 : le groupe du tableau apparaît dans un tableau, chaque bouton a un nom, et disparaît en dehors", async ({
  page,
}) => {
  await start(page);
  const group = page.getByRole("group", { name: "Tableau" });
  await expect(group).toBeHidden();
  await insertTable(page, 2, 2);
  await expect(group).toBeVisible();
  for (const name of TABLE_BUTTONS) await expect(group.getByRole("button", { name })).toBeVisible();
  await expect(button(page, "Insérer un tableau")).toBeDisabled();
  await page.keyboard.press("ControlOrMeta+End");
  await settleSelection(page);
  await expect(group).toBeHidden();
  await expect(button(page, "Insérer un tableau")).toBeEnabled();
});

test("critère 2 : ajouter et supprimer des lignes et des colonnes", async ({ page }) => {
  await start(page);
  await insertTable(page, 2, 2);
  await page.keyboard.type("A");
  const group = page.getByRole("group", { name: "Tableau" });
  await group.getByRole("button", { name: "Ajouter une ligne au-dessous" }).click();
  await group.getByRole("button", { name: "Ajouter une colonne à droite" }).click();
  await group.getByRole("button", { name: "Ajouter une colonne à gauche" }).click();
  await group.getByRole("button", { name: "Ajouter une ligne au-dessus" }).click();
  // La ligne au-dessus de l'en-tête devient la première ligne : le curseur y reste.
  expect((await tableText(page)).map((row) => row.length)).toEqual([4, 4, 4, 4]);
  expect((await tableText(page)).flat().filter((text) => text === "A")).toHaveLength(1);
  await group.getByRole("button", { name: "Supprimer la ligne" }).click();
  await group.getByRole("button", { name: "Supprimer la colonne" }).click();
  expect((await tableText(page)).map((row) => row.length)).toEqual([3, 3, 3]);
  await group.getByRole("button", { name: "Supprimer le tableau" }).click();
  await expect(editor(page).locator("table")).toHaveCount(0);
  await expect(group).toBeHidden();
});

test("critère 2 : activer ou retirer la ligne d'en-tête", async ({ page }) => {
  await start(page);
  await insertTable(page, 2, 2);
  const header = page.getByRole("group", { name: "Tableau" }).getByRole("button", {
    name: "Ligne d'en-tête",
  });
  await expect(header).toHaveAttribute("aria-pressed", "true");
  await header.click();
  await expect(editor(page).locator("th")).toHaveCount(0);
  await expect(header).toHaveAttribute("aria-pressed", "false");
  await header.click();
  await expect(editor(page).locator("tr").first().locator("th")).toHaveCount(2);
});

test("critère 3 : Tab passe à la cellule suivante, Shift+Tab à la précédente, Tab dans la dernière ajoute une ligne", async ({
  page,
}) => {
  await start(page);
  await insertTable(page, 2, 2);
  await page.keyboard.type("Poste");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Montant");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Courses");
  await page.keyboard.press("Tab");
  await page.keyboard.type("350");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("End");
  await page.keyboard.type(" bio");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Loyer");
  expect(await tableText(page)).toEqual([
    ["Poste", "Montant"],
    ["Courses bio", "350"],
    ["Loyer", ""],
  ]);
});

test("critère 4 : une cellule accepte gras, couleur, alignement et listes, mais pas un autre tableau", async ({
  page,
}) => {
  await start(page);
  await insertTable(page, 2, 2);
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type("gras");
  await page.keyboard.press("ControlOrMeta+b");
  await button(page, "Couleur du texte").click();
  await page
    .getByRole("group", { name: "Couleurs du texte" })
    .getByRole("button", { name: "Rouge" })
    .click();
  await page.keyboard.type(" rouge");
  await page.keyboard.press("ControlOrMeta+Shift+KeyE");
  await page.keyboard.press("Tab");
  await page.keyboard.press("ControlOrMeta+Shift+Digit8");
  await page.keyboard.type("lait");
  const cells = editor(page).locator("th");
  await expect(cells.first().locator("strong")).toHaveText("gras");
  await expect(cells.first().locator("p")).toHaveCSS("text-align", "center");
  await expect(cells.first().locator("[data-color='#C62828']")).toHaveText(" rouge");
  await expect(cells.nth(1).locator("ul > li")).toHaveText("lait");
  await expect(button(page, "Insérer un tableau")).toBeDisabled();
  await expect(editor(page).locator("table table")).toHaveCount(0);
});

test("critère 5 : le tableau occupe la largeur de la page, colonnes égales, bordures fines et grises, en-tête en gras", async ({
  page,
}) => {
  await start(page);
  await insertTable(page, 2, 3);
  await page.keyboard.type("Un en-tête bien plus long que les autres");
  const table = editor(page).locator("table");
  const tableWidth = await table.evaluate((node) => node.getBoundingClientRect().width);
  const editorWidth = await editor(page).evaluate((node) => node.getBoundingClientRect().width);
  expect(Math.abs(tableWidth - editorWidth)).toBeLessThan(2);
  const widths = await table
    .locator("tr")
    .first()
    .locator("th")
    .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().width)));
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  const cell = table.locator("td").first();
  await expect(cell).toHaveCSS("border-top-width", "1px");
  await expect(cell).toHaveCSS("border-top-color", "rgb(212, 212, 209)");
  await expect(table.locator("th").first()).toHaveCSS("font-weight", "600");
});

test("critère 6 : chaque cellule garde son identifiant à l'enregistrement et à la réouverture", async ({
  page,
}) => {
  await start(page);
  await insertTable(page, 2, 2);
  await page.keyboard.type("Poste");
  const before = await cellIds(page);
  expect(before).toHaveLength(4);
  expect(new Set(before).size).toBe(4);
  for (const id of before) expect(id).toBeTruthy();
  await saveAndReopen(page);
  expect(await cellIds(page)).toEqual(before);
  expect((await tableText(page))[0]).toEqual(["Poste", ""]);
});

test("critère 6 : un tableau collé depuis Nano Buro reçoit de nouveaux identifiants", async ({
  page,
}) => {
  await start(page);
  await insertTable(page, 2, 2);
  await page.keyboard.type("A");
  await page.keyboard.press("ControlOrMeta+a");
  await settleSelection(page);
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+End");
  await settleSelection(page);
  await page.keyboard.press("ControlOrMeta+v");
  await expect(editor(page).locator("table")).toHaveCount(2);
  const ids = await cellIds(page);
  expect(ids).toHaveLength(8);
  expect(new Set(ids).size).toBe(8);
});

test("critère 7 : un tableau collé depuis Word ou une page web reste un tableau, sans couleurs ni polices", async ({
  page,
}) => {
  await start(page);
  await pasteFromOtherApp(
    page,
    `<table class=MsoTableGrid border=1 style="border-collapse:collapse"><tr><td width=200 style="background:#FFC000"><p class=MsoNormal><b><span style="font-family:Calibri;color:red">Mois</span></b></p></td><td colspan=2><p class=MsoNormal>Budget</p></td></tr><tr><td>Janvier</td><td>1 200 €</td><td>Payé</td></tr></table>`,
  );
  expect(await tableText(page)).toEqual([
    ["Mois", "Budget", ""],
    ["Janvier", "1 200 €", "Payé"],
  ]);
  await expect(editor(page).locator("strong")).toHaveText("Mois");
  await expect(
    editor(page).locator("[style*='color'], [style*='background'], [data-font]"),
  ).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+End");
  await settleSelection(page);
  await pasteFromOtherApp(
    page,
    `<table><thead><tr><th style="font-family: Georgia; background: navy; color: white">Ville</th></tr></thead><tbody><tr><td>Lyon</td></tr></tbody></table>`,
  );
  await expect(editor(page).locator("table")).toHaveCount(2);
  await expect(editor(page).locator("table").last().locator("th")).toHaveText("Ville");
  expect(JSON.stringify(await ydocJson(page))).not.toMatch(/Calibri|Georgia|FFC000|navy/);
});

test("critère 8 : un tableau copié vers un e-mail reste un tableau HTML", async ({ page }) => {
  await start(page);
  await insertTable(page, 2, 2);
  await page.keyboard.type("Poste");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Montant");
  await page.keyboard.press("ControlOrMeta+a");
  await settleSelection(page);
  await page.keyboard.press("ControlOrMeta+c");
  const { html } = await readClipboard(page);
  expect(html).toMatch(/<table[^>]*>/);
  expect(html).toMatch(/<th[^>]*>.*Poste.*<\/th>/);
  expect(html).toMatch(/<tr[^>]*>/);
});

test("critère 10 : un tableau de 50 lignes et 10 colonnes reste fluide à la saisie", async ({
  page,
}) => {
  await start(page);
  const cell = (r: number, c: number): DocumentJson => ({
    type: r === 0 ? "tableHeader" : "tableCell",
    attrs: { id: `c-${String(r)}-${String(c)}` },
    content: [
      {
        type: "paragraph",
        attrs: { id: `p-${String(r)}-${String(c)}` },
        content: [{ type: "text", text: `Case ${String(r)}.${String(c)}` }],
      },
    ],
  });
  const json: DocumentJson = {
    type: "doc",
    content: [
      {
        type: "table",
        content: Array.from({ length: 50 }, (_, r) => ({
          type: "tableRow",
          content: Array.from({ length: 10 }, (_, c) => cell(r, c)),
        })),
      },
      { type: "paragraph", attrs: { id: "p-end" } },
    ],
  };
  const text = serializeDocument({ id: crypto.randomUUID(), ydoc: ydocFromJson(json) });
  await setFakeFiles(page, { files: { "budget.nano": text }, nextOpen: "budget.nano" });
  await button(page, "Ouvrir…").click();
  await expect(editor(page).locator("tr")).toHaveCount(50);
  await editor(page).locator("td").filter({ hasText: "Case 25.5" }).click();
  await settleSelection(page);
  const typed = "fluide à la saisie";
  const startTime = await page.evaluate(() => performance.now());
  await page.keyboard.type(typed);
  await expect(editor(page).locator("td").filter({ hasText: typed })).toHaveAttribute(
    "data-id",
    "c-25-5",
  );
  const elapsed = (await page.evaluate(() => performance.now())) - startTime;
  // Moins de 50 ms par caractère en moyenne, frappe de Playwright comprise.
  expect(elapsed / typed.length).toBeLessThan(50);
});
