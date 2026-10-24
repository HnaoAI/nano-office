// Tests d'interface du ticket T2.10 (souligné), dans Chromium.
import { expect, test } from "@playwright/test";
import {
  button,
  editor,
  MAC_USER_AGENT,
  readClipboard,
  saveAndReopen,
  selectText,
  settleSelection,
  start,
  waitUndoGroup,
  WINDOWS_USER_AGENT,
} from "./formatHelpers";
import { marksIn } from "./markHelpers";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("critère 1 : le bouton Souligné est entre Italique et Barré, au trait, sur fond noir quand il est actif", async ({
  page,
}) => {
  await start(page);
  const names = await page
    .getByRole("toolbar", { name: "Mise en forme" })
    .getByRole("button")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
  const italic = names.indexOf("Italique");
  expect(names.slice(italic, italic + 3)).toEqual(["Italique", "Souligné", "Barré"]);
  const underline = button(page, "Souligné");
  await expect(underline.locator("svg")).toBeVisible();

  await page.keyboard.type("Acheter du pain");
  await selectText(page, "du pain");
  await underline.click();
  await expect(editor(page).locator("u")).toHaveText("du pain");
  await expect(underline).toHaveAttribute("aria-pressed", "true");
  const colors = async (name: string) =>
    button(page, name).evaluate((node) => {
      const style = getComputedStyle(node);
      return [style.backgroundColor, style.color];
    });
  await page.keyboard.press("ControlOrMeta+b");
  expect(await colors("Souligné")).toEqual(await colors("Gras"));

  await underline.click();
  await expect(editor(page).locator("u")).toHaveCount(0);
  await expect(underline).toHaveAttribute("aria-pressed", "false");
});

for (const [platform, userAgent, keys] of [
  ["Windows", WINDOWS_USER_AGENT, "Control+KeyU"],
  ["Mac", MAC_USER_AGENT, "Meta+KeyU"],
] as const) {
  test.describe(platform, () => {
    test.use({ userAgent });
    test(`critère 2 : ${keys} souligne puis retire le souligné`, async ({ page }) => {
      await start(page);
      await page.keyboard.type("Acheter du pain");
      await selectText(page, "du pain");
      await page.keyboard.press(keys);
      await expect(editor(page).locator("u")).toHaveText("du pain");
      await page.keyboard.press(keys);
      await expect(editor(page).locator("u")).toHaveCount(0);
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
    key: "ù",
    code: "KeyU",
    ctrlKey: true,
    metaKey: false,
  });
  await expect(editor(page).locator("u")).toHaveText("du pain");
});

test("critère 3 : cumulé avec le gras et le barré, gardé à l'enregistrement et à l'impression", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Acheter du pain");
  await selectText(page, "du pain");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.press("ControlOrMeta+Shift+KeyX");
  await button(page, "Souligné").click();
  const json = await saveAndReopen(page);
  expect(marksIn(json, "du pain")).toEqual(["bold", "strike", "underline"]);
  await expect(editor(page).locator("u")).toHaveText("du pain");
  await page.emulateMedia({ media: "print" });
  const decoration = await editor(page)
    .locator("u")
    .evaluate((node) => getComputedStyle(node).textDecorationLine);
  expect(decoration).toContain("underline");
});

test("critère 3 : gardé dans un copier-coller interne et dans la copie vers un e-mail", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Acheter du pain");
  await selectText(page, "du pain");
  await button(page, "Souligné").click();
  await page.keyboard.press("ControlOrMeta+a");
  await settleSelection(page);
  await page.keyboard.press("ControlOrMeta+c");
  const { html } = await readClipboard(page);
  expect(html).toMatch(/<u>du pain<\/u>/);
  await page.keyboard.press("End");
  await settleSelection(page);
  await page.keyboard.press("Enter");
  await expect(editor(page).locator("p")).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+v");
  await expect(editor(page).locator("u")).toHaveText(["du pain", "du pain"]);
});

test("critère 4 : Ctrl/Cmd+Z annule le souligné en une fois", async ({ page }) => {
  await start(page);
  await page.keyboard.type("Acheter du pain");
  await waitUndoGroup(page);
  await selectText(page, "du pain");
  await page.keyboard.press("ControlOrMeta+KeyU");
  await expect(editor(page).locator("u")).toHaveText("du pain");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor(page).locator("u")).toHaveCount(0);
  await expect(editor(page)).toHaveText("Acheter du pain");
});

test("critère 4 : l'aide et son tableau des raccourcis citent le souligné", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "Aide", exact: true }).click();
  const help = page.getByRole("complementary", { name: "Aide" });
  await expect(help.getByText(/souligné/).first()).toBeVisible();
  const row = help.getByRole("row", { name: /^Souligné/ });
  await expect(row.locator("kbd")).toHaveText(/Ctrl\+U|⌘U/);
});
