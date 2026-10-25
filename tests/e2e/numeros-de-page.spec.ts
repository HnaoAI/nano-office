// Tests d'interface du ticket T2.15 (numéros de page imprimés), dans Chromium : réglage dans « Mise en
// page… », numéros dans le PDF de Chromium (zones de marge de `@page`), export Word, rien de plus à
// l'écran, réglage gardé à l'enregistrement et annulable.
import { expect, test } from "@playwright/test";
import { DEFAULT_HEADER_FOOTER } from "../../src/core/headerFooter";
import { fakeFiles } from "./fakeFileStore";
import { button, editor, saveAndReopen, start } from "./formatHelpers";
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
} from "./pageHelpers";

const NUMBERED = {
  ...DEFAULT_HEADER_FOOTER,
  pageNumbers: { position: "center" as const, skipFirst: false },
};

test.describe("T2.15 : numéros de page imprimés", () => {
  test("critère 1 : « Numéroter les pages », éteinte par défaut, avec la position et la première page", async ({
    page,
  }) => {
    await start(page);
    const box = await openPageDialog(page);
    const numbering = box.getByRole("checkbox", { name: "Numéroter les pages" });
    await expect(numbering).not.toBeChecked();
    await expect(box.getByRole("radio", { name: "En bas au centre" })).toHaveCount(0);
    await numbering.check();
    await expect(box.getByRole("radio", { name: "En bas au centre" })).toBeChecked();
    await expect(box.getByRole("radio", { name: "En bas à droite" })).not.toBeChecked();
    const first = box.getByRole("checkbox", { name: "Pas de numéro sur la première page" });
    await expect(first).not.toBeChecked();
    await box.getByRole("radio", { name: "En bas à droite" }).check();
    await first.check();
    await box.getByRole("button", { name: "Appliquer" }).click();
    await expect(pageDialog(page)).toHaveCount(0);
    // Rouverte, la boîte montre le réglage du document.
    const again = await openPageDialog(page);
    await expect(again.getByRole("checkbox", { name: "Numéroter les pages" })).toBeChecked();
    await expect(again.getByRole("radio", { name: "En bas à droite" })).toBeChecked();
    await expect(
      again.getByRole("checkbox", { name: "Pas de numéro sur la première page" }),
    ).toBeChecked();
  });

  test("critère 2 : à l'impression, un numéro par page, dans la zone de marge choisie, en IBM Plex Sans 10 pt", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, pages(3));
    const plain = await printToPdf(page);
    const count = pdfPageCount(plain);
    expect(count).toBeGreaterThanOrEqual(3);
    const box = await openPageDialog(page);
    await box.getByRole("checkbox", { name: "Numéroter les pages" }).check();
    await box.getByRole("button", { name: "Appliquer" }).click();
    const style = await page.evaluate(() =>
      Array.from(document.querySelectorAll("style"))
        .map((node) => node.textContent)
        .join("\n"),
    );
    expect(style).toContain("@bottom-center { content: counter(page);");
    expect(style).toContain('font-family: "IBM Plex Sans"');
    expect(style).toContain("font-size: 10pt");
    const numbered = await printToPdf(page);
    // Même nombre de pages, chacune avec son numéro sur une ligne à part.
    expect(pdfPageCount(numbered)).toBe(count);
    const texts = pdfPagesText(numbered);
    expect(texts).toHaveLength(count);
    texts.forEach((text, index) => {
      expect(text.split("\n")).toContain(String(index + 1));
    });
    expect(pdfPagesText(plain)[1]?.split("\n")).not.toContain("2");
  });

  test("critère 1 et 2 : « Pas de numéro sur la première page » retire le seul numéro de la page 1", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, pages(3), NUMBERED, "numerote");
    expect(pdfPagesText(await printToPdf(page))[0]?.split("\n")).toContain("1");
    const box = await openPageDialog(page);
    await box.getByRole("checkbox", { name: "Pas de numéro sur la première page" }).check();
    await box.getByRole("button", { name: "Appliquer" }).click();
    const [first, second, third] = pdfPagesText(await printToPdf(page));
    expect(first?.split("\n")).not.toContain("1");
    expect(second?.split("\n")).toContain("2");
    expect(third?.split("\n")).toContain("3");
  });

  test("critère 3 : dans l'export Word, un pied de page avec le champ de numéro de page de Word", async ({
    page,
  }) => {
    await fakeExportPicker(page);
    await start(page);
    await openDocument(page, pages(2), {
      ...NUMBERED,
      pageNumbers: { position: "right", skipFirst: false },
    });
    const word = await exportDocx(page);
    expect(word.footers.some((xml) => xml.includes("PAGE"))).toBe(true);
    expect(word.document).toContain("w:footerReference");
  });

  test("critère 4 : à l'écran, rien de plus que les repères ; le réglage est enregistré avec le document", async ({
    page,
  }) => {
    await start(page);
    await page.keyboard.type("Exposé 😀");
    const box = await openPageDialog(page);
    await box.getByRole("checkbox", { name: "Numéroter les pages" }).check();
    await box.getByRole("button", { name: "Appliquer" }).click();
    await expect(page.locator(".nano-margin-texts")).toHaveCount(0);
    await expect(page.locator(".nano-page")).not.toContainText("1");
    await saveAndReopen(page);
    const saved = JSON.parse((await fakeFiles(page)).files["document.nano"] ?? "{}") as {
      content: { attrs?: unknown };
    };
    expect(saved.content.attrs).toEqual({ pageNumbers: { position: "center", skipFirst: false } });
    const reopened = await openPageDialog(page);
    await expect(reopened.getByRole("checkbox", { name: "Numéroter les pages" })).toBeChecked();
  });

  test("critère 4 : Ctrl/Cmd+Z annule le réglage en une fois, avec la mise en page", async ({
    page,
  }) => {
    await start(page);
    await page.keyboard.type("Exposé");
    const box = await openPageDialog(page);
    await box.getByRole("radio", { name: "Paysage" }).check();
    await box.getByRole("checkbox", { name: "Numéroter les pages" }).check();
    await box.getByRole("button", { name: "Appliquer" }).click();
    await expect(page.locator(".nano-page")).toHaveAttribute("data-orientation", "landscape");
    await editor(page).focus();
    await button(page, "Annuler").click();
    await expect(page.locator(".nano-page")).toHaveAttribute("data-orientation", "portrait");
    const again = await openPageDialog(page);
    await expect(again.getByRole("checkbox", { name: "Numéroter les pages" })).not.toBeChecked();
    await expect(editor(page)).toHaveText("Exposé");
  });
});
