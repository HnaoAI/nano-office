// Tests d'interface du ticket B3 (impression de l'en-tête, du pied de page et des numéros), dans Chromium :
// le document du constat du product owner imprimé en PDF, relu avec pdfjs-dist (texte et position de chaque
// ligne) ; le calque de l'écran masqué à l'impression mais toujours affiché à l'écran ; le rappel de l'aide.
import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_HEADER_FOOTER, type HeaderFooter } from "../../src/core/headerFooter";
import { start } from "./formatHelpers";
import { heading, openDocument, pages, pdfLines, printToPdf, type PdfLine } from "./pageHelpers";

/** Marges du document par défaut (2,5 cm), en points du PDF. */
const MARGIN = (2.5 / 2.54) * 72;

const HEADER = "Exposé de Zoé";
const FOOTER = "Collège Jean Moulin";

/** Le document du constat : un en-tête avec un emoji, un Titre 1 « Partie 1 », du texte sur trois pages. */
const CONSTAT = [heading("h-1", 1, "Partie 1"), ...pages(3)];

function settings(overrides: Partial<HeaderFooter>): HeaderFooter {
  return { ...DEFAULT_HEADER_FOOTER, ...overrides };
}

/** Lignes d'une page qui contiennent `text`. */
function linesWith(lines: PdfLine[], text: string): PdfLine[] {
  return lines.filter((line) => line.text.includes(text));
}

async function printedLayerShown(page: Page): Promise<boolean> {
  await page.emulateMedia({ media: "print" });
  const shown = await page
    .locator(".nano-margin-texts")
    .evaluate((layer) => getComputedStyle(layer).display !== "none");
  await page.emulateMedia({ media: null });
  return shown;
}

test.describe("B3 : impression de l'en-tête, du pied de page et des numéros", () => {
  test("critère 1 : l'en-tête et le pied de page ne s'impriment qu'une fois par page, dans la marge", async ({
    page,
  }) => {
    await start(page);
    await openDocument(
      page,
      CONSTAT,
      settings({
        header: { text: `${HEADER} 😊`, align: "left" },
        footer: { text: FOOTER, align: "center" },
      }),
    );
    // Le calque de l'écran ne s'imprime pas.
    expect(await printedLayerShown(page)).toBe(false);
    const printed = await pdfLines(await printToPdf(page));
    expect(printed.length).toBeGreaterThanOrEqual(3);
    for (const { lines, height } of printed) {
      const headers = linesWith(lines, HEADER);
      expect(headers).toHaveLength(1);
      expect(headers[0]?.y).toBeGreaterThan(height - MARGIN);
      const footers = linesWith(lines, FOOTER);
      expect(footers).toHaveLength(1);
      expect(footers[0]?.y).toBeLessThan(MARGIN);
    }
    // Aucune copie dans la zone du texte, comme celle vue sous « Partie 1 » dans le constat.
    for (const { lines, height } of printed) {
      const inText = lines.filter((line) => line.y > MARGIN && line.y < height - MARGIN);
      expect(linesWith(inText, HEADER)).toEqual([]);
      expect(linesWith(inText, FOOTER)).toEqual([]);
    }
  });

  test("critère 2 : « Numéroter les pages » en bas à droite, sans numéro sur la première page : chaque autre page porte le sien", async ({
    page,
  }) => {
    await start(page);
    await openDocument(
      page,
      CONSTAT,
      settings({
        header: { text: `${HEADER} 😊`, align: "left" },
        pageNumbers: { position: "right", skipFirst: true },
      }),
    );
    const printed = await pdfLines(await printToPdf(page));
    expect(printed.length).toBeGreaterThanOrEqual(3);
    printed.forEach(({ lines, width }, index) => {
      const numbers = lines.filter((line) => /^\d+$/.test(line.text) && line.y < MARGIN);
      if (index === 0) {
        expect(numbers).toEqual([]);
        return;
      }
      expect(numbers.map((line) => line.text)).toEqual([String(index + 1)]);
      // À droite : au-delà du milieu de la page, dans la largeur du texte.
      expect(numbers[0]?.x).toBeGreaterThan(width / 2);
      expect(numbers[0]?.x).toBeLessThan(width - MARGIN);
      // L'en-tête reste là, une seule fois.
      expect(linesWith(lines, HEADER)).toHaveLength(1);
    });
  });

  test("critère 2 : numéro en bas au centre sur toutes les pages, avec un pied de page", async ({
    page,
  }) => {
    await start(page);
    await openDocument(
      page,
      CONSTAT,
      settings({
        footer: { text: FOOTER, align: "left" },
        pageNumbers: { position: "center", skipFirst: false },
      }),
    );
    const printed = await pdfLines(await printToPdf(page));
    printed.forEach(({ lines, width }, index) => {
      const numbers = lines.filter((line) => /^\d+$/.test(line.text) && line.y < MARGIN);
      expect(numbers.map((line) => line.text)).toEqual([String(index + 1)]);
      expect(Math.abs((numbers[0]?.x ?? 0) - width / 2)).toBeLessThan(20);
      expect(linesWith(lines, FOOTER)).toHaveLength(1);
    });
  });

  test("critère 4 : l'aide rappelle de décocher « En-têtes et pieds de page » dans « Imprimer, PDF et Word »", async ({
    page,
  }) => {
    await start(page);
    await page.getByRole("button", { name: "Aide", exact: true }).click();
    const help = page.getByRole("complementary", { name: "Aide" });
    await help
      .getByRole("navigation", { name: "Sommaire de l'aide" })
      .getByRole("button", { name: "Imprimer, PDF et Word" })
      .click();
    const section = help.getByRole("region", { name: "Imprimer, PDF et Word" });
    const reminder = section.getByText("décochez la case « En-têtes et pieds de page »");
    await expect(reminder).toBeVisible();
    await expect(reminder).toBeInViewport();
    await expect(reminder).toContainText("numéros de page");
  });

  test("critère 5 : à l'écran, rien ne change : l'en-tête et le pied de page restent affichés en gris clair", async ({
    page,
  }) => {
    await start(page);
    await openDocument(
      page,
      CONSTAT,
      settings({
        header: { text: `${HEADER} 😊`, align: "left" },
        footer: { text: FOOTER, align: "center" },
      }),
    );
    expect(await printedLayerShown(page)).toBe(false);
    const first = page.locator(".nano-margin-text-first");
    await expect(first).toBeVisible();
    await expect(first).toHaveText(`${HEADER} 😊`);
    await expect(page.locator(".nano-margin-text-last")).toHaveText(FOOTER);
    const marks = await page.locator(".nano-page-mark").count();
    expect(marks).toBeGreaterThanOrEqual(2);
    await expect(page.locator(".nano-margin-text-below")).toHaveCount(marks);
    const gray = await first.evaluate((node) => getComputedStyle(node).color);
    const text = await page
      .locator(".nano-editor p")
      .first()
      .evaluate((node) => getComputedStyle(node).color);
    expect(gray).not.toBe(text);
  });
});
