// Tests d'interface du ticket T2.14 (retrait de paragraphe), dans Chromium.
import { expect, test, type Page } from "@playwright/test";
import {
  button,
  editor,
  pasteFromOtherApp,
  saveAndReopen,
  settleSelection,
  start,
  topBlocks,
  waitUndoGroup,
} from "./formatHelpers";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

/** Décalage du texte du premier paragraphe par rapport à l'éditeur, en pixels. */
async function offsetOf(page: Page, index = 0): Promise<number> {
  return editor(page)
    .locator("p")
    .nth(index)
    .evaluate((node) => {
      const root = node.closest(".nano-editor");
      if (!root) throw new Error("éditeur absent");
      return node.getBoundingClientRect().left - root.getBoundingClientRect().left;
    });
}

/** 1,25 cm en pixels CSS (96 par pouce). */
const STEP_PX = (1.25 * 96) / 2.54;

test("critère 1 : les deux boutons suivent les boutons de liste", async ({ page }) => {
  await start(page);
  const names = await page
    .getByRole("toolbar", { name: "Mise en forme" })
    .getByRole("button")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
  const ordered = names.indexOf("Liste numérotée");
  expect(names.slice(ordered - 1, ordered + 3)).toEqual([
    "Liste à puces",
    "Liste numérotée",
    "Diminuer le retrait",
    "Augmenter le retrait",
  ]);
  await expect(button(page, "Augmenter le retrait").locator("svg")).toBeVisible();
});

test("critère 1 : chaque clic décale le paragraphe de 1,25 cm, jusqu'à 5 niveaux, et le titre aussi", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Une citation");
  const increase = button(page, "Augmenter le retrait");
  const decrease = button(page, "Diminuer le retrait");
  await expect(decrease).toBeDisabled();
  for (let level = 1; level <= 5; level++) {
    await increase.click();
    await expect.poll(() => offsetOf(page)).toBeCloseTo(level * STEP_PX, 0);
  }
  await expect(increase).toBeDisabled();
  await decrease.click();
  await expect.poll(() => offsetOf(page)).toBeCloseTo(4 * STEP_PX, 0);
  expect((await topBlocks(page))[0]?.attrs?.indent).toBe(4);

  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+Shift+Digit2");
  await page.keyboard.type("Un titre");
  await expect(editor(page).locator("h2")).toHaveText("Un titre");
  // Entrée garde le retrait, comme dans Word.
  expect((await topBlocks(page))[1]?.attrs?.indent).toBe(4);
});

test("critère 1 : dans une liste, les boutons décalent l'élément comme Tab et Shift+Tab", async ({
  page,
}) => {
  await start(page);
  await button(page, "Liste à puces").click();
  await page.keyboard.type("Un");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Deux");
  await button(page, "Augmenter le retrait").click();
  await expect(editor(page).locator("ul ul li")).toHaveText("Deux");
  await button(page, "Diminuer le retrait").click();
  await expect(editor(page).locator("ul ul")).toHaveCount(0);
  expect(JSON.stringify(await topBlocks(page))).not.toContain('"indent":1');
});

test("critère 2 : Tab et Shift+Tab ne décalent pas un paragraphe hors des listes", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Texte");
  await page.keyboard.press("Home");
  await settleSelection(page);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await editor(page).click();
  expect((await topBlocks(page))[0]?.attrs?.indent ?? null).toBeNull();
  expect(await offsetOf(page)).toBeCloseTo(0, 0);
});

test("critère 3 : gardé à l'enregistrement, à l'impression et dans un collage interne", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Une citation");
  await button(page, "Augmenter le retrait").click();
  await button(page, "Augmenter le retrait").click();
  const json = await saveAndReopen(page);
  expect(json.content?.[0]?.attrs?.indent).toBe(2);
  await expect.poll(() => offsetOf(page)).toBeCloseTo(2 * STEP_PX, 0);
  await page.emulateMedia({ media: "print" });
  expect(await offsetOf(page)).toBeCloseTo(2 * STEP_PX, 0);
  await page.emulateMedia({ media: "screen" });

  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await settleSelection(page);
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("End");
  await settleSelection(page);
  await page.keyboard.press("Enter");
  await button(page, "Diminuer le retrait").click();
  await button(page, "Diminuer le retrait").click();
  await page.keyboard.press("ControlOrMeta+v");
  await expect
    .poll(async () => (await topBlocks(page)).map((b) => b.attrs?.indent))
    .toEqual([2, 2]);
});

test("critère 3 : un collage extérieur retire le retrait", async ({ page }) => {
  await start(page);
  await pasteFromOtherApp(
    page,
    '<p data-indent="3" style="margin-left: 3.75cm">Collé du web</p>',
    "Collé du web",
  );
  await expect(editor(page)).toContainText("Collé du web");
  expect((await topBlocks(page)).map((block) => block.attrs?.indent ?? null)).toEqual([null]);
});

test("critère 4 : Ctrl/Cmd+Z annule le retrait en une fois", async ({ page }) => {
  await start(page);
  await page.keyboard.type("Une citation");
  await waitUndoGroup(page);
  await button(page, "Augmenter le retrait").click();
  await expect.poll(() => offsetOf(page)).toBeCloseTo(STEP_PX, 0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => offsetOf(page)).toBeCloseTo(0, 0);
  await expect(editor(page)).toHaveText("Une citation");
});
