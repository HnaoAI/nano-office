// Tests d'interface du ticket T2.4 (majuscules et minuscules), dans Chromium.
import { expect, test, type Page } from "@playwright/test";
import {
  button,
  editor,
  selectText,
  settleSelection,
  start,
  waitUndoGroup,
  ydocJson,
} from "./formatHelpers";

/** Ouvre le menu « Aa » à la souris et choisit une conversion. */
async function convert(page: Page, label: string) {
  await button(page, "Majuscules et minuscules").click();
  await page
    .getByRole("group", { name: "Changer la casse" })
    .getByRole("button", { name: label, exact: true })
    .click();
}

/** Texte sélectionné dans la page. */
function selectedText(page: Page) {
  return page.evaluate(() => window.getSelection()?.toString() ?? "");
}

test("critère 1 : le bouton « Aa » ouvre un menu de quatre choix, au style des grilles de couleur", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Texte");
  await page.keyboard.press("ControlOrMeta+a");
  const caseButton = button(page, "Majuscules et minuscules");
  await expect(caseButton).toHaveText("Aa");
  await caseButton.click();
  const menu = page.getByRole("group", { name: "Changer la casse" });
  await expect(menu.getByRole("button")).toHaveText([
    "MAJUSCULES",
    "minuscules",
    "Première lettre de la phrase",
    "Première Lettre De Chaque Mot",
  ]);
  await expect(menu).toHaveClass(/nano-popover/);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(caseButton).toBeFocused();
});

test("critère 1 : le menu se parcourt au clavier", async ({ page }) => {
  await start(page);
  await page.keyboard.type("bonjour");
  await page.keyboard.press("ControlOrMeta+a");
  await button(page, "Majuscules et minuscules").click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(editor(page)).toHaveText("Bonjour");
});

test("critère 2 : les lettres elles-mêmes changent, dans la sélection seulement", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("le chœur de l'église");
  await selectText(page, "chœur");
  await convert(page, "MAJUSCULES");
  await expect(editor(page)).toHaveText("le CHŒUR de l'église");
  const json = JSON.stringify(await ydocJson(page));
  expect(json).toContain("CHŒUR");
  expect(await editor(page).evaluate((node) => getComputedStyle(node).textTransform)).toBe("none");
});

test("critère 2 : sans sélection, le bouton est sans effet (grisé)", async ({ page }) => {
  await start(page);
  await page.keyboard.type("texte");
  await expect(button(page, "Majuscules et minuscules")).toBeDisabled();
  await expect(editor(page)).toHaveText("texte");
});

test("critère 3 : règles du français, chiffres, ponctuation et emojis inchangés", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("élève ça cœur, 12 € ! 😀 🇫🇷");
  await page.keyboard.press("ControlOrMeta+a");
  await convert(page, "MAJUSCULES");
  await expect(editor(page)).toHaveText("ÉLÈVE ÇA CŒUR, 12 € ! 😀 🇫🇷");
  await convert(page, "minuscules");
  await expect(editor(page)).toHaveText("élève ça cœur, 12 € ! 😀 🇫🇷");
});

test("critère 4 : la mise en forme est gardée lettre par lettre, et la sélection reste la même", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("BONJOUR TOUT LE MONDE");
  await selectText(page, "TOUT LE");
  await page.keyboard.press("ControlOrMeta+b");
  // « OUT LE MON » est à cheval sur le gras : sélection au clavier.
  await page.keyboard.press("Home");
  for (let i = 0; i < 9; i += 1) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 10; i += 1) await page.keyboard.press("Shift+ArrowRight");
  await settleSelection(page);
  await convert(page, "Première Lettre De Chaque Mot");
  await expect(editor(page)).toHaveText("BONJOUR Tout Le MonDE");
  await expect(editor(page).locator("strong")).toHaveText("Tout Le");
  expect(await selectedText(page)).toBe("out Le Mon");
});

test("critère 5 : Ctrl/Cmd+Z annule le changement en une fois", async ({ page }) => {
  await start(page);
  await page.keyboard.type("TEXTE COLLÉ EN MAJUSCULES");
  await waitUndoGroup(page);
  await page.keyboard.press("ControlOrMeta+a");
  await convert(page, "minuscules");
  await expect(editor(page)).toHaveText("texte collé en majuscules");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor(page)).toHaveText("TEXTE COLLÉ EN MAJUSCULES");
});

test("critère 6 : Première lettre de la phrase, après . ! ? et au début de chaque paragraphe", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("BONJOUR. ÇA VA ? OUI ! TRÈS BIEN");
  await page.keyboard.press("Enter");
  await page.keyboard.type("DEUXIÈME PARAGRAPHE");
  await page.keyboard.press("ControlOrMeta+a");
  await convert(page, "Première lettre de la phrase");
  await expect(editor(page).locator("p")).toHaveText([
    "Bonjour. Ça va ? Oui ! Très bien",
    "Deuxième paragraphe",
  ]);
});
