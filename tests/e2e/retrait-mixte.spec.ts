// Tests d'interface du ticket B2 (retrait sur une sélection qui mélange liste et paragraphes), dans Chromium :
// l'essai A du constat, puis un seul Ctrl/Cmd+Z.
import { expect, test } from "@playwright/test";
import type { DocumentJson } from "../../src/core/types";
import { button, editor, settleSelection, start, topBlocks, waitUndoGroup } from "./formatHelpers";

const BAKERY = "Ensuite, passer à la boulangerie…";
const BAGS = "Penser à rapporter les sacs.";

/** Structure lisible : « • » par niveau de liste, « →n » pour un retrait, puis le texte. */
function lines(blocks: DocumentJson[], depth = 0): string[] {
  return blocks.flatMap((block) => {
    if (block.type === "bulletList" || block.type === "orderedList") {
      return (block.content ?? []).flatMap((item) => lines(item.content ?? [], depth + 1));
    }
    const text = (block.content ?? []).map((node) => node.text ?? "").join("");
    if (depth > 0) return [`${"•".repeat(depth)} ${text}`];
    const indent = Number(block.attrs?.indent ?? 0);
    return [`${indent ? `→${String(indent)} ` : ""}${text}`];
  });
}

test("B2 essai A : de « Poireaux » à la fin, les éléments deviennent des sous-points et les paragraphes se décalent ; un Ctrl/Cmd+Z remet tout", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Au marché :");
  await page.keyboard.press("Enter");
  await button(page, "Liste à puces").click();
  await page.keyboard.type("Pommes");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Poireaux");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Fromage");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type(BAKERY);
  await page.keyboard.press("Enter");
  await page.keyboard.type(BAGS);
  const initial = ["Au marché :", "• Pommes", "• Poireaux", "• Fromage", BAKERY, BAGS];
  await expect.poll(async () => lines(await topBlocks(page))).toEqual(initial);
  await waitUndoGroup(page);
  // Sélection de « Poireaux » jusqu'à la fin du dernier paragraphe.
  await editor(page)
    .getByText("Poireaux")
    .click({ position: { x: 1, y: 5 } });
  await page.keyboard.press("Home");
  await page.keyboard.press("ControlOrMeta+Shift+End");
  await settleSelection(page);
  await button(page, "Augmenter le retrait").click();
  await expect
    .poll(async () => lines(await topBlocks(page)))
    .toEqual([
      "Au marché :",
      "• Pommes",
      "•• Poireaux",
      "•• Fromage",
      `→1 ${BAKERY}`,
      `→1 ${BAGS}`,
    ]);
  await expect(button(page, "Diminuer le retrait")).toBeEnabled();
  await waitUndoGroup(page);
  await editor(page).focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => lines(await topBlocks(page))).toEqual(initial);
});
