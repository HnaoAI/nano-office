// Tests d'interface du ticket T2.13 (exposant et indice), dans Chromium.
import { expect, test, type Page } from "@playwright/test";
import {
  button,
  editor,
  MAC_USER_AGENT,
  saveAndReopen,
  selectText,
  settleSelection,
  start,
  waitUndoGroup,
  WINDOWS_USER_AGENT,
} from "./formatHelpers";
import { marksIn } from "./markHelpers";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

function caseMenu(page: Page) {
  return page.getByRole("group", { name: "Changer la casse" });
}

function scriptItem(page: Page, name: "Exposant" | "Indice") {
  return caseMenu(page).getByRole("menuitemcheckbox", { name });
}

/** Choisit « Exposant » ou « Indice » dans le menu « Aa ». */
async function choose(page: Page, name: "Exposant" | "Indice") {
  await button(page, "Majuscules et minuscules").click();
  await scriptItem(page, name).click();
}

test("critère 1 : « Exposant » et « Indice » sont dans le menu « Aa », sous les quatre choix, sans nouveau bouton", async ({
  page,
}) => {
  await start(page);
  const before = await page
    .getByRole("toolbar", { name: "Mise en forme" })
    .getByRole("button")
    .count();
  await page.keyboard.type("1er");
  await selectText(page, "er");
  await button(page, "Majuscules et minuscules").click();
  const labels = await caseMenu(page)
    .locator(".nano-menu-item")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent));
  expect(labels).toEqual([
    "MAJUSCULES",
    "minuscules",
    "Première lettre de la phrase",
    "Première Lettre De Chaque Mot",
    "Exposant",
    "Indice",
  ]);
  await expect(page.getByRole("button", { name: "Exposant" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(
    await page.getByRole("toolbar", { name: "Mise en forme" }).getByRole("button").count(),
  ).toBe(before);
});

test("critère 1 : « Exposant » s'atteint au clavier dans le menu", async ({ page }) => {
  await start(page);
  await page.keyboard.type("1er");
  await selectText(page, "er");
  await button(page, "Majuscules et minuscules").click();
  for (let step = 0; step < 4; step++) await page.keyboard.press("ArrowDown");
  await expect(scriptItem(page, "Exposant")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(editor(page).locator("sup")).toHaveText("er");
});

test("critère 3 : exposant et indice s'excluent, et le menu montre l'état du texte sous le curseur", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("H2O");
  await selectText(page, "2");
  await choose(page, "Exposant");
  await expect(editor(page).locator("sup")).toHaveText("2");
  await selectText(page, "2");
  await button(page, "Majuscules et minuscules").click();
  await expect(scriptItem(page, "Exposant")).toHaveAttribute("aria-checked", "true");
  await expect(scriptItem(page, "Indice")).toHaveAttribute("aria-checked", "false");
  await scriptItem(page, "Indice").click();
  await expect(editor(page).locator("sub")).toHaveText("2");
  await expect(editor(page).locator("sup")).toHaveCount(0);
  await selectText(page, "2");
  await button(page, "Majuscules et minuscules").click();
  await expect(scriptItem(page, "Indice")).toHaveAttribute("aria-checked", "true");
  await expect(scriptItem(page, "Exposant")).toHaveAttribute("aria-checked", "false");
});

for (const [platform, userAgent, sup, sub] of [
  ["Windows", WINDOWS_USER_AGENT, "Control+Period", "Control+Comma"],
  ["Mac", MAC_USER_AGENT, "Meta+Period", "Meta+Comma"],
] as const) {
  test.describe(platform, () => {
    test.use({ userAgent });
    test(`critère 2 : ${sup} met en exposant et ${sub} en indice`, async ({ page }) => {
      await start(page);
      await page.keyboard.type("1er H2O");
      await selectText(page, "er");
      await page.keyboard.press(sup);
      await expect(editor(page).locator("sup")).toHaveText("er");
      await selectText(page, "2");
      await page.keyboard.press(sub);
      await expect(editor(page).locator("sub")).toHaveText("2");
    });
  });
}

test("critère 2 : sur un clavier AZERTY, le point (Shift+;) et la virgule fonctionnent", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("1er H2O");
  await selectText(page, "er");
  await editor(page).dispatchEvent("keydown", {
    key: ".",
    code: "Comma",
    ctrlKey: true,
    shiftKey: true,
  });
  await expect(editor(page).locator("sup")).toHaveText("er");
  await selectText(page, "2");
  await editor(page).dispatchEvent("keydown", { key: ",", code: "KeyM", ctrlKey: true });
  await expect(editor(page).locator("sub")).toHaveText("2");
});

test("critère 2 : sans sélection, Ctrl/Cmd+. met en exposant le texte tapé ensuite", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("1");
  await page.keyboard.press("ControlOrMeta+Period");
  await page.keyboard.type("er");
  await page.keyboard.press("ControlOrMeta+Period");
  await page.keyboard.type(" mai");
  await expect(editor(page).locator("sup")).toHaveText("er");
  await expect(editor(page)).toHaveText("1er mai");
});

test("critère 4 : gardés à l'enregistrement, à l'impression et dans un copier-coller interne", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("m2 H2O");
  await selectText(page, "m2");
  await page.keyboard.press("End");
  await selectText(page, "2 ");
  await page.keyboard.press("ControlOrMeta+Period");
  const json = await saveAndReopen(page);
  expect(marksIn(json, "2 ")).toEqual(["superscript"]);
  await page.emulateMedia({ media: "print" });
  expect(
    await editor(page)
      .locator("sup")
      .evaluate((node) => getComputedStyle(node).verticalAlign),
  ).toBe("super");
  await page.emulateMedia({ media: "screen" });
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await settleSelection(page);
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("End");
  await settleSelection(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(editor(page).locator("sup")).toHaveCount(2);
});

test("critère 4 : Ctrl/Cmd+Z annule l'exposant en une fois", async ({ page }) => {
  await start(page);
  await page.keyboard.type("1er");
  await waitUndoGroup(page);
  await selectText(page, "er");
  await choose(page, "Exposant");
  await expect(editor(page).locator("sup")).toHaveText("er");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor(page).locator("sup")).toHaveCount(0);
  await expect(editor(page)).toHaveText("1er");
});
