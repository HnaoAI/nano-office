// Tests d'interface du ticket T2.3 (barré), dans Chromium.
import { expect, test } from "@playwright/test";
import {
  button,
  editor,
  MAC_USER_AGENT,
  readClipboard,
  saveAndReopen,
  selectText,
  start,
  waitUndoGroup,
  WINDOWS_USER_AGENT,
} from "./formatHelpers";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

/** Marques du morceau de texte `text` dans un contenu JSON relu. */
function marksIn(json: unknown, text: string): string[] {
  const found: string[][] = [];
  const walk = (node: unknown) => {
    if (typeof node !== "object" || node === null) return;
    const value = node as { text?: string; marks?: { type: string }[]; content?: unknown[] };
    if (value.text === text) found.push((value.marks ?? []).map((mark) => mark.type).sort());
    value.content?.forEach(walk);
  };
  walk(json);
  if (found.length === 0) throw new Error(`texte absent : ${text}`);
  return found[0] ?? [];
}

test("critère 1 : le bouton Barré suit Gras et Italique, au trait, sur fond noir quand il est actif", async ({
  page,
}) => {
  await start(page);
  const names = await page
    .getByRole("toolbar", { name: "Mise en forme" })
    .getByRole("button")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
  const italic = names.indexOf("Italique");
  expect(names.slice(italic - 1, italic + 2)).toEqual(["Gras", "Italique", "Barré"]);
  const strike = button(page, "Barré");
  await expect(strike.locator("svg")).toBeVisible();

  await page.keyboard.type("Acheter du pain");
  await selectText(page, "du pain");
  await strike.click();
  await expect(editor(page).locator("s")).toHaveText("du pain");
  await expect(strike).toHaveAttribute("aria-pressed", "true");
  const colors = async (name: string) =>
    button(page, name).evaluate((node) => {
      const style = getComputedStyle(node);
      return [style.backgroundColor, style.color];
    });
  await page.keyboard.press("ControlOrMeta+b");
  expect(await colors("Barré")).toEqual(await colors("Gras"));

  await strike.click();
  await expect(editor(page).locator("s")).toHaveCount(0);
  await expect(strike).toHaveAttribute("aria-pressed", "false");
});

for (const [platform, userAgent, keys] of [
  ["Windows", WINDOWS_USER_AGENT, "Control+Shift+KeyX"],
  ["Mac", MAC_USER_AGENT, "Meta+Shift+KeyX"],
] as const) {
  test.describe(platform, () => {
    test.use({ userAgent });
    test(`critère 2 : ${keys} barre puis débarre la sélection`, async ({ page }) => {
      await start(page);
      await page.keyboard.type("Acheter du pain");
      await selectText(page, "du pain");
      await page.keyboard.press(keys);
      await expect(editor(page).locator("s")).toHaveText("du pain");
      await page.keyboard.press(keys);
      await expect(editor(page).locator("s")).toHaveCount(0);
    });
  });
}

test("critère 2 : le raccourci est reconnu à la touche physique, même si elle produit un autre caractère", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Acheter du pain");
  await selectText(page, "du pain");
  await editor(page).dispatchEvent("keydown", {
    key: "Ξ",
    code: "KeyX",
    ctrlKey: true,
    metaKey: false,
    shiftKey: true,
  });
  await expect(editor(page).locator("s")).toHaveText("du pain");
});

test("critère 3 et 4 : cumulé avec le gras et l'italique, gardé à l'enregistrement et à la réouverture", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Acheter du pain");
  await selectText(page, "du pain");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.press("ControlOrMeta+i");
  await button(page, "Barré").click();
  const json = await saveAndReopen(page);
  expect(marksIn(json, "du pain")).toEqual(["bold", "italic", "strike"]);
  await expect(editor(page).locator("s")).toHaveText("du pain");
});

test("critère 4 : gardé dans un copier-coller interne et dans la copie vers un e-mail", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Acheter du pain");
  await selectText(page, "du pain");
  await button(page, "Barré").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  const { html } = await readClipboard(page);
  expect(html).toMatch(/<s>du pain<\/s>/);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(editor(page).locator("s")).toHaveText(["du pain", "du pain"]);
});

test("critère 5 : Ctrl/Cmd+Z annule le barré en une fois", async ({ page }) => {
  await start(page);
  await page.keyboard.type("Acheter du pain");
  await waitUndoGroup(page);
  await selectText(page, "du pain");
  await page.keyboard.press("ControlOrMeta+Shift+KeyX");
  await expect(editor(page).locator("s")).toHaveText("du pain");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor(page).locator("s")).toHaveCount(0);
  await expect(editor(page)).toHaveText("Acheter du pain");
});
