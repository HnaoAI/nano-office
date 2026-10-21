// Tests d'interface du ticket T1.8 (tableaux), dans Chromium.
import { expect, test } from "@playwright/test";
import {
  button,
  editor,
  saveAndReopen,
  settleSelection,
  start,
  waitUndoGroup,
} from "./formatHelpers";
import { cellIds, insertTable, tableText } from "./tableHelpers";

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

test("critère 2 : on ne peut pas supprimer seule la dernière ligne ou la dernière colonne", async ({
  page,
}) => {
  await start(page);
  await insertTable(page, 1, 1);
  const group = page.getByRole("group", { name: "Tableau" });
  await expect(group.getByRole("button", { name: "Supprimer la ligne" })).toBeDisabled();
  await expect(group.getByRole("button", { name: "Supprimer la colonne" })).toBeDisabled();
  await expect(group.getByRole("button", { name: "Supprimer le tableau" })).toBeEnabled();
});

test("critère 3 : dans une liste d'une cellule, Tab décale l'élément, puis passe à la cellule suivante quand c'est impossible", async ({
  page,
}) => {
  await start(page);
  await insertTable(page, 2, 2);
  await page.keyboard.press("ControlOrMeta+Shift+Digit8");
  await page.keyboard.type("lait");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Prix");
  expect((await tableText(page))[0]).toEqual(["lait", "Prix"]);
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("œufs");
  await page.keyboard.press("Tab");
  await expect(editor(page).locator("th").first().locator("li li")).toHaveText("œufs");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("!");
  await expect(editor(page).locator("th").first().locator("li li")).toHaveCount(0);
});

test("Ctrl/Cmd+Z annule l'insertion d'un tableau, puis l'ajout d'une ligne, en une fois chacun", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Budget");
  await page.keyboard.press("Enter");
  await waitUndoGroup(page);
  await insertTable(page, 2, 2);
  await waitUndoGroup(page);
  await page
    .getByRole("group", { name: "Tableau" })
    .getByRole("button", { name: "Ajouter une ligne au-dessous" })
    .click();
  await expect(editor(page).locator("tr")).toHaveCount(3);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor(page).locator("tr")).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor(page).locator("table")).toHaveCount(0);
  await expect(editor(page)).toHaveText("Budget");
});
