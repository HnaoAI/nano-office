// Tests d'interface du ticket T2.11 (compteur de mots), dans Chromium : pied de page, sélection, fenêtre des
// statistiques, 100 pages sans ralentir la frappe, rien d'enregistré.
import { expect, test, type Page } from "@playwright/test";
import { serializeDocument } from "../../src/core/fileFormat";
import type { DocumentJson } from "../../src/core/types";
import { ydocFromJson } from "../core/helpers";
import { fakeFiles, setFakeFiles } from "./fakeFileStore";
import { button, editor, selectText, start, waitEditorFocus } from "./formatHelpers";

/** Espace fine insécable des nombres à la française (« 1 234 »). */
const THIN = " ";

function wordCounter(page: Page) {
  return page.locator(".nano-footer").getByRole("button", { name: /mots?( sur|$)/ });
}

function para(id: string, value: string): DocumentJson {
  return { type: "paragraph", attrs: { id }, content: [{ type: "text", text: value }] };
}

async function openDocument(page: Page, content: DocumentJson[]) {
  const file = serializeDocument({
    id: crypto.randomUUID(),
    ydoc: ydocFromJson({ type: "doc", content }),
  });
  await setFakeFiles(page, { files: { "devoir.nano": file }, nextOpen: "devoir.nano" });
  await button(page, "Ouvrir…").click();
  await expect(page.getByRole("banner").getByText("devoir", { exact: true })).toBeVisible();
  await waitEditorFocus(page);
}

test("critère 1 : le pied de page affiche le nombre de mots à côté de « Page 1 sur 1 »", async ({
  page,
}) => {
  await start(page);
  await expect(wordCounter(page)).toHaveText("0 mot");
  await page.keyboard.type("Mon devoir de français");
  await expect(wordCounter(page)).toHaveText("4 mots");
  const counters = page.locator(".nano-footer-counters");
  await expect(counters.locator(".nano-page-counter")).toHaveText("Page 1 sur 1");
  await expect(counters).toContainText("4 mots");
});

test("critère 1 : avec une sélection, « 2 mots sur 4 »", async ({ page }) => {
  await start(page);
  await page.keyboard.type("Mon devoir de français");
  await selectText(page, "devoir de");
  await expect(wordCounter(page)).toHaveText("2 mots sur 4");
  await page.keyboard.press("End");
  await expect(wordCounter(page)).toHaveText("4 mots");
});

test("critère 1 : un grand nombre s'écrit à la française, « 1 234 mots »", async ({ page }) => {
  await start(page);
  await openDocument(page, [para("p-1", Array.from({ length: 1234 }, () => "mot").join(" "))]);
  await expect(wordCounter(page)).toHaveText(`1${THIN}234 mots`);
});

test("critère 2 : apostrophes, traits d'union et nombres comme dans Word ; titres, listes et cellules comptent", async ({
  page,
}) => {
  await start(page);
  await openDocument(page, [
    {
      type: "heading",
      attrs: { id: "h-1", level: 1 },
      content: [{ type: "text", text: "L'école" }],
    },
    para("p-1", "Mon porte-clés coûte 12 € 😀"),
    {
      type: "bulletList",
      content: [{ type: "listItem", attrs: { id: "l-1" }, content: [para("p-2", "un élément")] }],
    },
    { type: "pageBreak", attrs: { id: "s-1" } },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [{ type: "tableCell", attrs: { id: "c-1" }, content: [para("p-3", "cellule")] }],
        },
      ],
    },
  ]);
  // 1 + 6 + 2 + 1 : « € » et « 😀 », séparés par des espaces, comptent comme dans Word.
  await expect(wordCounter(page)).toHaveText("10 mots");
});

test("critère 3 : un clic ouvre la fenêtre des statistiques, Échap la ferme", async ({ page }) => {
  await start(page);
  await page.keyboard.type("Bonjour à tous");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Fin");
  await wordCounter(page).click();
  const stats = page.getByRole("dialog", { name: "Statistiques" });
  await expect(stats).toBeVisible();
  await expect(stats).toHaveClass(/nano-popover/);
  const rows = await stats.getByRole("row").allTextContents();
  expect(rows).toEqual([
    "Mots4",
    "Caractères (espaces compris)17",
    "Caractères (sans les espaces)15",
    "Paragraphes2",
    "Pages1",
  ]);
  await page.keyboard.press("Escape");
  await expect(stats).toHaveCount(0);
  await expect(wordCounter(page)).toBeFocused();
});

test("critère 4 : 100 pages se comptent sans ralentir la frappe, au plus une fois par image", async ({
  page,
}) => {
  await start(page);
  const sentence =
    "Le cerf-volant de Zoé s'élève au-dessus des champs de blé, poussé par un vent d'été. ";
  const content = Array.from({ length: 700 }, (_, index) =>
    para(`p-${index}`, sentence.repeat(3).trim()),
  );
  await openDocument(page, content);
  const total = 700 * 3 * 15;
  await expect(wordCounter(page)).toHaveText(
    `${String(total).slice(0, 2)}${THIN}${String(total).slice(2)} mots`,
  );
  await page.evaluate(() => performance.clearMeasures("nano-word-count"));
  await editor(page).press("ControlOrMeta+Home");
  await editor(page).pressSequentially("Bonjour Zoé ", { delay: 20 });
  await expect(wordCounter(page)).toHaveText(
    `${String(total + 2).slice(0, 2)}${THIN}${String(total + 2).slice(2)} mots`,
  );
  const durations = await page.evaluate(() =>
    performance.getEntriesByName("nano-word-count").map((entry) => entry.duration),
  );
  expect(durations.length).toBeGreaterThan(0);
  expect(durations.length).toBeLessThanOrEqual(12 + 3);
  expect(Math.max(...durations)).toBeLessThan(30);
});

test("critère 5 : rien n'est enregistré dans le document", async ({ page }) => {
  await start(page);
  await page.keyboard.type("Trois petits chats");
  await expect(wordCounter(page)).toHaveText("3 mots");
  await wordCounter(page).click();
  await button(page, "Enregistrer").click();
  await expect.poll(async () => (await fakeFiles(page)).files["document.nano"]).toBeTruthy();
  const saved = (await fakeFiles(page)).files["document.nano"] ?? "";
  expect(saved).not.toMatch(/mots|wordCount|Statistiques/);
});
