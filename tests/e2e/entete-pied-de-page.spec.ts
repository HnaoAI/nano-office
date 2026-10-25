// Tests d'interface du ticket T2.16 (en-tête et pied de page du document), dans Chromium : champs de
// « Mise en page… », impression (zones de marge de `@page`, PDF de Chromium), affichage en gris clair
// dans les marges de la feuille et près des repères de page, double clic, page de garde, enregistrement
// et export Word.
import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_HEADER_FOOTER, type HeaderFooter } from "../../src/core/headerFooter";
import { fakeFiles } from "./fakeFileStore";
import { saveAndReopen, start } from "./formatHelpers";
import {
  exportDocx,
  fakeExportPicker,
  openDocument,
  openPageDialog,
  pageDialog,
  pages,
  pdfPageCount,
  pdfPagesText,
  printToPdf,
  settleLayout,
} from "./pageHelpers";

const NAME = "Léa Martin — 3e B 😀";
const SCHOOL = "Collège Jean Moulin";

/** Textes relus dans le PDF, avec des accents (les emojis n'y sont pas relus, voir `pdfPagesText`). */
const PRINT_HEADER = "Léa Martin";
const PRINT_FOOTER = "Collège Jean Moulin";

const BOTH: HeaderFooter = {
  ...DEFAULT_HEADER_FOOTER,
  header: { text: NAME, align: "right" },
  footer: { text: SCHOOL, align: "center" },
};

function shownTexts(page: Page) {
  return page.locator(".nano-margin-text");
}

test.describe("T2.16 : en-tête et pied de page", () => {
  test("critère 1 : deux champs d'une ligne, avec leur alignement, acceptent accents et emojis", async ({
    page,
  }) => {
    await start(page);
    await page.keyboard.type("Exposé");
    const box = await openPageDialog(page);
    await box.getByRole("textbox", { name: "En-tête" }).fill(NAME);
    await box
      .getByRole("group", { name: "Alignement : En-tête" })
      .getByRole("button", { name: "Aligner à droite" })
      .click();
    await box.getByRole("textbox", { name: "Pied de page" }).fill(SCHOOL);
    await box
      .getByRole("group", { name: "Alignement : Pied de page" })
      .getByRole("button", { name: "Centrer" })
      .click();
    await box.getByRole("button", { name: "Appliquer" }).click();
    await expect(pageDialog(page)).toHaveCount(0);
    const again = await openPageDialog(page);
    await expect(again.getByRole("textbox", { name: "En-tête" })).toHaveValue(NAME);
    await expect(again.getByRole("textbox", { name: "Pied de page" })).toHaveValue(SCHOOL);
    await expect(
      again
        .getByRole("group", { name: "Alignement : En-tête" })
        .getByRole("button", { name: "Aligner à droite" }),
    ).toHaveAttribute("aria-pressed", "true");
    // Texte collé sur plusieurs lignes : une seule ligne est gardée.
    await again.getByRole("textbox", { name: "En-tête" }).fill("");
    await again.getByRole("textbox", { name: "En-tête" }).evaluate((input: HTMLInputElement) => {
      input.focus();
    });
    await page.keyboard.insertText("Ligne 1\nLigne 2");
    await again.getByRole("button", { name: "Appliquer" }).click();
    await expect(shownTexts(page).first()).toHaveText(/^Ligne 1\s?Ligne 2$/);
  });

  test("critère 2 : ils s'impriment en haut et en bas de chaque page, en IBM Plex Sans 10 pt, couleur discrète", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, pages(3));
    const plain = await printToPdf(page);
    const count = pdfPageCount(plain);
    const box = await openPageDialog(page);
    await box.getByRole("textbox", { name: "En-tête" }).fill(PRINT_HEADER);
    await box.getByRole("textbox", { name: "Pied de page" }).fill(PRINT_FOOTER);
    await box.getByRole("checkbox", { name: "Numéroter les pages" }).check();
    await box.getByRole("button", { name: "Appliquer" }).click();
    const style = await page.evaluate(() =>
      Array.from(document.querySelectorAll("style"))
        .map((node) => node.textContent)
        .join("\n"),
    );
    expect(style).toContain(`@top-left { content: "${PRINT_HEADER}";`);
    // Pied de page à gauche, numéro au centre : deux zones voisines, sans chevauchement.
    expect(style).toContain(`@bottom-left { content: "${PRINT_FOOTER}";`);
    expect(style).toContain("@bottom-center { content: counter(page);");
    expect(style).toContain("font-size: 10pt");
    expect(style).toContain("color: #5f5f5c");
    const printed = await printToPdf(page);
    expect(pdfPageCount(printed)).toBe(count);
    // Chaque page a son en-tête, son pied de page et son numéro.
    pdfPagesText(printed).forEach((text, index) => {
      expect(text).toContain(PRINT_HEADER);
      expect(text).toContain(PRINT_FOOTER);
      expect(text.split("\n")).toContain(String(index + 1));
    });
    expect(pdfPagesText(plain).join("")).not.toContain(PRINT_FOOTER);
  });

  test("critère 3 : à l'écran, en gris clair, en haut de la première page, en bas de la dernière et près des repères", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, pages(3), BOTH);
    await settleLayout(page);
    const marks = await page.locator(".nano-page-mark").count();
    expect(marks).toBeGreaterThanOrEqual(2);
    const first = page.locator(".nano-margin-text-first");
    const last = page.locator(".nano-margin-text-last");
    await expect(first).toHaveText(NAME);
    await expect(last).toHaveText(SCHOOL);
    await expect(page.locator(".nano-margin-text-above")).toHaveCount(marks);
    await expect(page.locator(".nano-margin-text-below")).toHaveCount(marks);
    const look = await first.evaluate((node) => {
      const style = getComputedStyle(node);
      const sheet = (node.closest(".nano-page") as Element).getBoundingClientRect();
      const text = (document.querySelector(".nano-editor") as Element).getBoundingClientRect();
      const box = node.getBoundingClientRect();
      return {
        color: style.color,
        align: style.textAlign,
        inTopMargin: box.top >= sheet.top && box.bottom <= text.top,
      };
    });
    expect(look).toEqual({ color: "rgb(154, 154, 150)", align: "right", inTopMargin: true });
    const lastBox = await last.evaluate((node) => {
      const sheet = (node.closest(".nano-page") as Element).getBoundingClientRect();
      const text = (document.querySelector(".nano-editor") as Element).getBoundingClientRect();
      const box = node.getBoundingClientRect();
      return box.top >= text.bottom && box.bottom <= sheet.bottom;
    });
    expect(lastBox).toBe(true);
    // Près de chaque repère : le pied de page juste au-dessus du trait, l'en-tête juste dessous.
    const near = await page.evaluate(() => {
      const lines = Array.from(document.querySelectorAll(".nano-page-mark")).map(
        (mark) => mark.getBoundingClientRect().top,
      );
      const above = Array.from(document.querySelectorAll(".nano-margin-text-above")).map(
        (node) => node.getBoundingClientRect().bottom,
      );
      const below = Array.from(document.querySelectorAll(".nano-margin-text-below")).map(
        (node) => node.getBoundingClientRect().top,
      );
      return lines.every(
        (line, index) =>
          Math.abs((above[index] ?? 0) - line) <= 6 && Math.abs((below[index] ?? 0) - line) <= 6,
      );
    });
    expect(near).toBe(true);
  });

  test("critère 3 : un double clic ouvre « Mise en page… » sur le champ de l'en-tête ou du pied de page", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, pages(2), BOTH);
    await page.locator(".nano-margin-text-first span").dblclick();
    await expect(pageDialog(page).getByRole("textbox", { name: "En-tête" })).toBeFocused();
    await pageDialog(page).getByRole("button", { name: "Annuler" }).click();
    await expect(pageDialog(page)).toHaveCount(0);
    await page.locator(".nano-margin-text-last span").dblclick();
    await expect(pageDialog(page).getByRole("textbox", { name: "Pied de page" })).toBeFocused();
  });

  test("critère 4 : « Pas d'en-tête ni de pied de page sur la première page », pour une page de garde", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, pages(3));
    const plain = await printToPdf(page);
    const count = pdfPageCount(plain);
    let box = await openPageDialog(page);
    await box.getByRole("textbox", { name: "En-tête" }).fill(PRINT_HEADER);
    await box.getByRole("textbox", { name: "Pied de page" }).fill(PRINT_FOOTER);
    await box.getByRole("button", { name: "Appliquer" }).click();
    for (const text of pdfPagesText(await printToPdf(page))) expect(text).toContain(PRINT_HEADER);
    box = await openPageDialog(page);
    await box
      .getByRole("checkbox", { name: "Pas d'en-tête ni de pied de page sur la première page" })
      .check();
    await box.getByRole("button", { name: "Appliquer" }).click();
    // À l'impression : l'en-tête et le pied de page de la page 1 seulement disparaissent.
    const texts = pdfPagesText(await printToPdf(page));
    expect(texts).toHaveLength(count);
    expect(texts[0]).not.toContain(PRINT_HEADER);
    expect(texts[0]).not.toContain(PRINT_FOOTER);
    for (const text of texts.slice(1)) {
      expect(text).toContain(PRINT_HEADER);
      expect(text).toContain(PRINT_FOOTER);
    }
    // À l'écran : plus d'en-tête en haut de la page 1, ni de pied de page au premier repère.
    await expect(page.locator(".nano-margin-text-first")).toHaveCount(0);
    const marks = await page.locator(".nano-page-mark").count();
    await expect(page.locator(".nano-margin-text-above")).toHaveCount(marks - 1);
    await expect(page.locator(".nano-margin-text-below")).toHaveCount(marks);
  });

  test("critère 5 : enregistrés dans le document et retrouvés à la réouverture", async ({
    page,
  }) => {
    await start(page);
    await page.keyboard.type("Exposé");
    const box = await openPageDialog(page);
    await box.getByRole("textbox", { name: "En-tête" }).fill(NAME);
    await box.getByRole("button", { name: "Appliquer" }).click();
    await saveAndReopen(page);
    const saved = JSON.parse((await fakeFiles(page)).files["document.nano"] ?? "{}") as {
      content: { attrs?: unknown };
    };
    expect(saved.content.attrs).toEqual({ pageHeader: { text: NAME, align: "left" } });
    await expect(page.locator(".nano-margin-text-first")).toHaveText(NAME);
  });

  test("critère 5 : dans l'export Word, ce sont les en-têtes et pieds de page de Word", async ({
    page,
  }) => {
    await fakeExportPicker(page);
    await start(page);
    await openDocument(page, pages(1), { ...BOTH, skipFirst: true });
    const word = await exportDocx(page);
    expect(word.headers.some((xml) => xml.includes(NAME))).toBe(true);
    expect(word.footers.some((xml) => xml.includes(SCHOOL))).toBe(true);
    expect(word.document).toContain("w:titlePg");
  });
});
