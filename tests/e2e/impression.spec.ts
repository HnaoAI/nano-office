// Tests d'interface du ticket T2.6 (imprimer et enregistrer en PDF), dans Chromium. La boîte
// d'impression du navigateur ne peut pas être pilotée : `window.print` est compté, la feuille de style
// d'impression est vérifiée avec `emulateMedia`, et le PDF de Chromium (`page.pdf`) donne le format.
import { expect, test, type Page } from "@playwright/test";
import { serializeDocument } from "../../src/core/fileFormat";
import { ydocFromJson } from "../core/helpers";
import { fakeFiles, setFakeFiles } from "./fakeFileStore";
import {
  button,
  editor,
  MAC_USER_AGENT,
  start,
  waitEditorFocus,
  WINDOWS_USER_AGENT,
  ydocJson,
} from "./formatHelpers";
import { insertWithButton, makeImage } from "./imageHelpers";

/** Compte les appels à `window.print`, sans ouvrir la vraie boîte (elle bloquerait le test). */
async function countPrints(page: Page) {
  await page.addInitScript(() => {
    const counter = window as unknown as { __prints: number };
    counter.__prints = 0;
    window.print = () => {
      counter.__prints += 1;
    };
  });
}

function prints(page: Page) {
  return page.evaluate(() => (window as unknown as { __prints: number }).__prints);
}

/** Lettre avec un titre, un texte rouge surligné en jaune et un tableau à en-tête. */
const LETTER = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { id: "h-1", level: 1 },
      content: [{ type: "text", text: "Lettre à Zoé" }],
    },
    {
      type: "paragraph",
      attrs: { id: "p-1" },
      content: [
        {
          type: "text",
          text: "Texte important 😀",
          marks: [
            { type: "textStyle", attrs: { color: "#C62828", fontFamily: "EB Garamond" } },
            { type: "highlight", attrs: { color: "#FFF176" } },
          ],
        },
      ],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: ["Nom", "Âge"].map((text, index) => ({
            type: "tableHeader",
            attrs: { id: `th-${index}` },
            content: [
              {
                type: "paragraph",
                attrs: { id: `thp-${index}` },
                content: [{ type: "text", text }],
              },
            ],
          })),
        },
        {
          type: "tableRow",
          content: ["Zoé", "12"].map((text, index) => ({
            type: "tableCell",
            attrs: { id: `td-${index}` },
            content: [
              {
                type: "paragraph",
                attrs: { id: `tdp-${index}` },
                content: [{ type: "text", text }],
              },
            ],
          })),
        },
      ],
    },
    { type: "paragraph", attrs: { id: "p-2" }, content: [{ type: "text", text: "Fin." }] },
  ],
};

/** Ouvre la lettre d'exemple depuis « lettre.nano ». */
async function openLetter(page: Page) {
  await start(page);
  const text = serializeDocument({ id: crypto.randomUUID(), ydoc: ydocFromJson(LETTER) });
  await setFakeFiles(page, { files: { "lettre.nano": text }, nextOpen: "lettre.nano" });
  await button(page, "Ouvrir…").click();
  await expect(editor(page)).toContainText("Lettre à Zoé");
  await waitEditorFocus(page);
}

/** Taille des pages d'un PDF (points), lue dans ses `/MediaBox`. */
function pdfPageSizes(pdf: Buffer): string[] {
  return [...pdf.toString("latin1").matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)].map(
    ([, width, height]) => `${Math.round(Number(width))}x${Math.round(Number(height))}`,
  );
}

test("critère 1 : le bouton « Imprimer » du groupe Fichier ouvre la boîte d'impression, et rappelle le PDF", async ({
  page,
}) => {
  await countPrints(page);
  await start(page);
  const print = page
    .getByRole("toolbar", { name: "Fichier" })
    .getByRole("button", { name: "Imprimer" });
  await expect(print).toHaveAttribute("title", /Enregistrer au format PDF/);
  await print.click();
  expect(await prints(page)).toBe(1);
  // Le curseur reste dans l'éditeur.
  await expect(editor(page)).toBeFocused();
});

test("critère 1 : Ctrl+P ouvre la boîte d'impression sur Windows, mais pas Ctrl+Alt+P (AltGr)", async ({
  browser,
}) => {
  const context = await browser.newContext({ userAgent: WINDOWS_USER_AGENT });
  const page = await context.newPage();
  await countPrints(page);
  await start(page);
  await page.keyboard.type("Bonjour");
  await page.keyboard.press("Control+KeyP");
  expect(await prints(page)).toBe(1);
  await page.keyboard.press("Control+Alt+KeyP");
  expect(await prints(page)).toBe(1);
  await expect(page.getByRole("button", { name: "Imprimer" })).toHaveAttribute("title", /Ctrl\+P/);
  await context.close();
});

test("critère 1 : Cmd+P ouvre la boîte d'impression sur Mac", async ({ browser }) => {
  const context = await browser.newContext({ userAgent: MAC_USER_AGENT });
  const page = await context.newPage();
  await countPrints(page);
  await start(page);
  await page.keyboard.press("Meta+KeyP");
  expect(await prints(page)).toBe(1);
  await expect(page.getByRole("button", { name: "Imprimer" })).toHaveAttribute("title", /⌘P/);
  await context.close();
});

test("critère 2 : seule la page du document s'imprime, sans en-tête, barre, message ni pied de page", async ({
  page,
}) => {
  await openLetter(page);
  await page.keyboard.press("ControlOrMeta+f");
  await expect(page.locator(".nano-search-bar")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  for (const hidden of [
    page.getByRole("banner"),
    page.locator(".nano-format-row"),
    page.locator(".nano-search-bar"),
    page.locator(".nano-footer"),
    page.locator(".nano-message"),
  ]) {
    await expect(hidden).toBeHidden();
  }
  await expect(editor(page)).toBeVisible();
  const pageStyle = await page.locator(".nano-page").evaluate((element) => {
    const style = getComputedStyle(element);
    return { shadow: style.boxShadow, padding: style.padding };
  });
  expect(pageStyle).toEqual({ shadow: "none", padding: "0px" });
});

test("critère 3 : le PDF est en A4, dans l'orientation du document", async ({ page }) => {
  await openLetter(page);
  expect(pdfPageSizes(await page.pdf({ preferCSSPageSize: true }))).toEqual(["595x842"]);
  await button(page, "Mise en page…").click();
  await page.getByRole("radio", { name: "Paysage" }).check();
  await page.getByRole("radio", { name: "Personnalisées" }).check();
  await page.getByRole("textbox", { name: "Haut" }).fill("1");
  await page.getByRole("textbox", { name: "Droite" }).fill("4,9");
  await page.getByRole("button", { name: "Appliquer" }).click();
  expect(pdfPageSizes(await page.pdf({ preferCSSPageSize: true }))).toEqual(["842x595"]);
  // Les marges du document sont celles de la règle @page.
  const rules = await page.evaluate(() =>
    [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .filter((rule) => rule instanceof CSSPageRule)
      .map((rule) => rule.cssText),
  );
  expect(rules.join(" ")).toContain("margin: 1cm 4.9cm 2.5cm 2.5cm");
});

test("critère 3 : un document très long s'imprime sur plusieurs pages A4", async ({ page }) => {
  await start(page);
  const long = {
    type: "doc",
    content: Array.from({ length: 300 }, (_, index) => ({
      type: "paragraph",
      attrs: { id: `p-${index}` },
      content: [{ type: "text", text: `Paragraphe ${index}, été, Noël 🎄` }],
    })),
  };
  const text = serializeDocument({ id: crypto.randomUUID(), ydoc: ydocFromJson(long) });
  await setFakeFiles(page, { files: { "long.nano": text }, nextOpen: "long.nano" });
  await button(page, "Ouvrir…").click();
  await expect(editor(page)).toContainText("Paragraphe 299");
  const sizes = pdfPageSizes(await page.pdf({ preferCSSPageSize: true }));
  expect(sizes.length).toBeGreaterThan(5);
  expect(new Set(sizes)).toEqual(new Set(["595x842"]));
});

test("critère 4 : polices intégrées, couleurs et surlignage, bordures des tableaux et lignes entières", async ({
  page,
}) => {
  await openLetter(page);
  await page.emulateMedia({ media: "print" });
  const text = await page.getByText("Texte important").evaluate((element) => {
    const span = element.closest("span") ?? element;
    const mark = element.closest("mark");
    return {
      adjust: getComputedStyle(span).printColorAdjust,
      font: getComputedStyle(span).fontFamily.split(",")[0]?.replace(/"/g, ""),
      color: getComputedStyle(span).color,
      highlight: mark ? getComputedStyle(mark).backgroundColor : null,
      markAdjust: mark ? getComputedStyle(mark).printColorAdjust : null,
    };
  });
  expect(text).toEqual({
    adjust: "exact",
    font: "EB Garamond",
    color: "rgb(198, 40, 40)",
    highlight: "rgb(255, 241, 118)",
    markAdjust: "exact",
  });
  const fontLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('16px "EB Garamond"');
  });
  expect(fontLoaded).toBe(true);
  const table = await page
    .locator(".nano-editor td")
    .first()
    .evaluate((cell) => ({
      border: getComputedStyle(cell).borderTopWidth,
      rowBreak: getComputedStyle(cell.parentElement as Element).breakInside,
    }));
  expect(table).toEqual({ border: "1px", rowBreak: "avoid" });
});

test("critère 4 : une image tient dans la largeur de la page imprimée", async ({ page }) => {
  await start(page);
  await insertWithButton(page, [
    await makeImage(page, "large.png", { width: 1600, height: 400, type: "image/png" }),
  ]);
  await expect(page.locator(".nano-editor img")).toHaveCount(1);
  await page.emulateMedia({ media: "print" });
  const widths = await page.locator(".nano-editor img").evaluate((image) => ({
    image: image.getBoundingClientRect().width,
    page: (image.closest(".nano-editor") as Element).getBoundingClientRect().width,
  }));
  expect(widths.image).toBeLessThanOrEqual(widths.page);
});

test("critère 5 : un titre n'est jamais seul en bas de page", async ({ page }) => {
  await openLetter(page);
  await page.emulateMedia({ media: "print" });
  const breakAfter = await page
    .locator(".nano-editor h1")
    .evaluate((heading) => getComputedStyle(heading).breakAfter);
  expect(breakAfter).toBe("avoid");
});

test("critère 6 : le surlignage de la recherche et la sélection ne s'impriment pas", async ({
  page,
}) => {
  await openLetter(page);
  await page.keyboard.press("ControlOrMeta+f");
  await page.getByRole("textbox", { name: "Rechercher" }).fill("Zoé");
  await expect(page.locator(".nano-search-match")).not.toHaveCount(0);
  await page.emulateMedia({ media: "print" });
  const styles = await page.locator(".nano-search-match").evaluateAll((matches) =>
    matches.map((match) => ({
      background: getComputedStyle(match).backgroundColor,
      outline: getComputedStyle(match).outlineStyle,
    })),
  );
  for (const style of styles)
    expect(style).toEqual({ background: "rgba(0, 0, 0, 0)", outline: "none" });
  const selection = await page.evaluate(() => {
    const probe = document.querySelector(".nano-editor p");
    return probe ? getComputedStyle(probe, "::selection").backgroundColor : null;
  });
  expect(selection).toBe("rgba(0, 0, 0, 0)");
});

test("critère 7 : imprimer ne modifie pas le document et ne compte pas comme une modification", async ({
  page,
}) => {
  await countPrints(page);
  await openLetter(page);
  const indicator = page.getByRole("banner").locator(".nano-save-state");
  await expect(indicator).toHaveText("Enregistré");
  const before = await ydocJson(page);
  const callsBefore = (await fakeFiles(page)).calls.length;
  await page.getByRole("button", { name: "Imprimer" }).click();
  await page.keyboard.press("ControlOrMeta+KeyP");
  expect(await prints(page)).toBe(2);
  await page.pdf();
  expect(await ydocJson(page)).toEqual(before);
  await expect(indicator).toHaveText("Enregistré");
  await expect(page).toHaveTitle("lettre.nano - Nano Buro");
  expect((await fakeFiles(page)).calls.length).toBe(callsBefore);
});
