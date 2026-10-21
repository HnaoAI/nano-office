// Tests d'interface du ticket T1.8 (tableaux), dans Chromium : collage depuis Nano Buro, Word et une
// page web, copie vers un e-mail, tableau de 50 lignes et 10 colonnes.
import { expect, test } from "@playwright/test";
import { serializeDocument } from "../../src/core/fileFormat";
import type { DocumentJson } from "../../src/core/types";
import { ydocFromJson } from "../core/helpers";
import { setFakeFiles } from "./fakeFileStore";
import {
  button,
  editor,
  pasteFromOtherApp,
  readClipboard,
  settleSelection,
  start,
  ydocJson,
} from "./formatHelpers";
import { cellIds, insertTable, tableText } from "./tableHelpers";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

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
  expect(html).toMatch(/<td[^>]*style="[^"]*border: 1px solid/);
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
