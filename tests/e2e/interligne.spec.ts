// Tests d'interface du ticket T2.2 (interligne), dans Chromium.
import { expect, test, type Page } from "@playwright/test";
import {
  editor,
  pasteFromOtherApp,
  saveAndReopen,
  selectText,
  settleSelection,
  start,
  topBlocks,
  waitUndoGroup,
} from "./formatHelpers";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

function lineHeightSelect(page: Page) {
  return page.getByRole("combobox", { name: "Interligne" });
}

/** Hauteur de ligne calculée, rapportée à la taille du texte, du bloc qui contient `text`. */
function ratioOf(page: Page, text: string) {
  return editor(page)
    .locator("p, h1, h2, h3", { hasText: text })
    .first()
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return Math.round((parseFloat(style.lineHeight) / parseFloat(style.fontSize)) * 100) / 100;
    });
}

// Depuis M1, « Par défaut » s'appelle « Interligne normal » (M1, critère 3 : adaptation autorisée par le PO).
test("critère 1 : la liste Interligne propose Interligne normal, 1, 1,15, 1,5, 2", async ({
  page,
}) => {
  await start(page);
  await expect(lineHeightSelect(page).locator("option:not([hidden])")).toHaveText([
    "Interligne normal",
    "1",
    "1,15",
    "1,5",
    "2",
  ]);
  await expect(lineHeightSelect(page)).toHaveValue("default");
});

test("critère 2 et 3 : sans sélection, le paragraphe du curseur prend la hauteur de ligne de Word", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Premier");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second");
  for (const [label, ratio] of [
    ["1", 1.2],
    ["1,15", 1.38],
    ["1,5", 1.8],
    ["2", 2.4],
  ] as const) {
    await lineHeightSelect(page).selectOption({ label });
    expect(await ratioOf(page, "Second")).toBe(ratio);
  }
  expect(await ratioOf(page, "Premier")).toBe(1.65);
  await expect(editor(page)).toBeFocused();
});

test("critère 2 : s'applique aux titres, éléments de liste et paragraphes sélectionnés", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.press("ControlOrMeta+Shift+Digit1");
  await page.keyboard.type("Titre");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Texte");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+Shift+Digit8");
  await page.keyboard.type("Élément");
  await page.keyboard.press("ControlOrMeta+a");
  await lineHeightSelect(page).selectOption({ label: "1,5" });
  for (const text of ["Titre", "Texte", "Élément"]) expect(await ratioOf(page, text)).toBe(1.8);
});

test("critère 4 : Interligne normal garde l'interligne de la charte (1,65) et retire l'attribut", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Texte");
  await lineHeightSelect(page).selectOption({ label: "2" });
  await lineHeightSelect(page).selectOption({ label: "Interligne normal" });
  expect(await ratioOf(page, "Texte")).toBe(1.65);
  expect((await topBlocks(page))[0]?.attrs?.lineHeight ?? null).toBeNull();
});

test("critère 5 : la liste montre l'interligne du curseur et reste vide pour une sélection mélangée", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Aéré");
  await lineHeightSelect(page).selectOption({ label: "2" });
  await page.keyboard.press("Enter");
  await page.keyboard.type("Serré");
  await lineHeightSelect(page).selectOption({ label: "1" });
  await expect(lineHeightSelect(page)).toHaveValue("1");
  await selectText(page, "Aéré");
  await expect(lineHeightSelect(page)).toHaveValue("2");
  await page.keyboard.press("ControlOrMeta+a");
  await expect(lineHeightSelect(page)).toHaveValue("");
});

test("critère 6 : gardé à l'enregistrement, à la réouverture et dans un copier-coller interne", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Lettre");
  await lineHeightSelect(page).selectOption({ label: "1,5" });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("End");
  await settleSelection(page);
  await page.keyboard.press("Enter");
  await lineHeightSelect(page).selectOption({ label: "Interligne normal" });
  await expect(lineHeightSelect(page)).toHaveValue("default");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(editor(page).locator("p")).toHaveText(["Lettre", "Lettre"]);
  const json = await saveAndReopen(page);
  expect(json.content?.map((block) => block.attrs?.lineHeight ?? null)).toContain("1.5");
  for (const paragraph of await editor(page).locator("p").all()) {
    await expect(paragraph).toHaveAttribute("style", /line-height: 1\.8/);
  }
});

test("critère 6 : un collage depuis une autre application ne garde pas l'interligne", async ({
  page,
}) => {
  await start(page);
  await pasteFromOtherApp(page, '<p style="line-height: 3">Collé du web</p>', "Collé du web");
  await expect(editor(page)).toContainText("Collé du web");
  expect(await ratioOf(page, "Collé du web")).toBe(1.65);
});

test("critère 7 : Ctrl/Cmd+Z annule un changement d'interligne en une fois", async ({ page }) => {
  await start(page);
  await page.keyboard.type("Texte");
  await waitUndoGroup(page);
  await lineHeightSelect(page).selectOption({ label: "2" });
  expect(await ratioOf(page, "Texte")).toBe(2.4);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await ratioOf(page, "Texte")).toBe(1.65);
  await expect(editor(page)).toHaveText("Texte");
});

test("M1, critère 1 : une icône d'interligne au trait s'affiche devant la liste, dans le même contrôle", async ({
  page,
}) => {
  await start(page);
  const select = lineHeightSelect(page);
  const control = page.locator(".nano-select-with-icon", { has: select });
  const icon = control.locator("svg");
  await expect(icon).toHaveCount(1);
  await expect(icon).toHaveAttribute("aria-hidden", "true");
  await expect(icon).toHaveAttribute("stroke-width", "1.75");
  await expect(icon).toHaveAttribute("width", "18");
  const iconBox = await icon.boundingBox();
  const selectBox = await select.boundingBox();
  if (!iconBox || !selectBox) throw new Error("icône ou liste invisible");
  // Devant le texte de la liste, à l'intérieur de son fond gris.
  expect(iconBox.x).toBeGreaterThan(selectBox.x);
  expect(iconBox.x + iconBox.width).toBeLessThan(selectBox.x + 40);
  expect(iconBox.y).toBeGreaterThan(selectBox.y);
  expect(iconBox.y + iconBox.height).toBeLessThan(selectBox.y + selectBox.height);
  // Un clic sur l'icône ouvre la liste : elle ne prend pas le clic.
  await expect(icon).toHaveCSS("pointer-events", "none");
});

test("M1, critère 2 et 3 : « Interligne normal » est le premier choix, au nom accessible inchangé, et un fichier existant s'affiche à l'identique", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Texte");
  const select = lineHeightSelect(page);
  await expect(select).toHaveAccessibleName("Interligne");
  await expect(select.locator("option").first()).toHaveText("Interligne normal");
  await expect(select).toHaveValue("default");
  await select.selectOption({ label: "1,15" });
  const reopened = await saveAndReopen(page);
  expect(reopened.content?.[0]?.attrs?.lineHeight).toBe("1.15");
  await editor(page).click();
  await expect(lineHeightSelect(page)).toHaveValue("1.15");
  expect(await ratioOf(page, "Texte")).toBe(1.38);
});
