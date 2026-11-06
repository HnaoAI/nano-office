// Tests d'interface du ticket PL6 (feuilles séparées), dans Chromium : une feuille par page imprimée, texte jamais dans
// l'espace gris, frappe et sélection à travers une coupure, flèches, document inchangé, en-tête, pied de page et
// numéro sur chaque feuille, recherche et plan qui amènent dans une feuille, rien d'imprimé ni d'enregistré.
import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_HEADER_FOOTER, type HeaderFooter } from "../../src/core/headerFooter";
import { fakeFiles } from "./fakeFileStore";
import {
  button,
  editor,
  settleSelection,
  start,
  topBlocks,
  waitAfterFocus,
  ydocJson,
} from "./formatHelpers";
import {
  openDocument,
  pages,
  pdfPageCount,
  pdfPagesText,
  printToPdf,
  settleLayout,
} from "./pageHelpers";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

function sheets(page: Page) {
  return page.locator(".nano-sheet");
}

/** Nombre de pages du compteur « Page 3 sur 7 ». */
async function counted(page: Page): Promise<number> {
  const text = (await page.locator(".nano-page-counter").textContent()) ?? "";
  return Number(/sur (\d+)/.exec(text)?.[1] ?? 0);
}

/** Rectangle de la feuille `index` (0 pour la première), dans la fenêtre. */
async function sheetBox(page: Page, index: number) {
  const box = await sheets(page).nth(index).boundingBox();
  if (!box) throw new Error(`feuille ${String(index + 1)} invisible`);
  return box;
}

/** Feuille qui contient la hauteur `y` de la fenêtre, ou 0 si elle est dans l'espace gris. */
async function sheetAtY(page: Page, y: number): Promise<number> {
  return page.evaluate((target) => {
    const found = Array.from(document.querySelectorAll<HTMLElement>(".nano-sheet")).find(
      (sheet) => {
        const box = sheet.getBoundingClientRect();
        return target >= box.top && target <= box.bottom;
      },
    );
    return found ? Number(found.dataset.page) : 0;
  }, y);
}

/** Haut, dans la fenêtre, de la ligne du curseur. */
async function caretTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const rect = range?.getClientRects()[0] ?? range?.getBoundingClientRect();
    return rect?.top ?? -1;
  });
}

const NUMBERED: HeaderFooter = {
  ...DEFAULT_HEADER_FOOTER,
  pageNumbers: { position: "right", skipFirst: false },
  header: { text: "Exposé de Zoé 🌾", align: "left" },
  footer: { text: "Collège", align: "center" },
};

test.describe("PL6 : feuilles séparées", () => {
  test("critères 1 et 2 : une feuille blanche par page imprimée, séparée de la suivante par un espace gris", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, pages(3));
    await settleLayout(page);
    const count = pdfPageCount(await printToPdf(page));
    await expect(sheets(page)).toHaveCount(count);
    expect(await counted(page)).toBe(count);
    const first = await sheetBox(page, 0);
    const second = await sheetBox(page, 1);
    expect(Math.round(second.y - (first.y + first.height))).toBe(24);
    const colors = await page.evaluate(() => {
      const sheet = document.querySelector(".nano-sheet") as Element;
      return {
        sheet: getComputedStyle(sheet).backgroundColor,
        shadow: getComputedStyle(sheet).boxShadow,
        gap: getComputedStyle(document.querySelector(".nano-sheets-backdrop") as Element)
          .backgroundColor,
        app: getComputedStyle(document.body).backgroundColor,
      };
    });
    expect(colors.sheet).toBe("rgb(255, 255, 255)");
    expect(colors.shadow).toContain("rgba(0, 0, 0, 0.08)");
    expect(colors.gap).toBe(colors.app);
    // A4 portrait : 29,7 cm de haut, à 96 pixels par pouce.
    expect(first.height).toBeCloseTo((29.7 / 2.54) * 96, 0);
  });

  test("critère 2 : un paragraphe coupé continue en haut de la feuille suivante", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, pages(2));
    await settleLayout(page);
    const second = await sheetBox(page, 1);
    const firstLine = await page.evaluate((top) => {
      const walker = document.createTreeWalker(
        document.querySelector(".nano-editor") as Element,
        NodeFilter.SHOW_TEXT,
      );
      let best = Infinity;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.top > top && rect.top < best) best = rect.top;
        }
      }
      return best;
    }, second.y);
    const margin = (2.5 / 2.54) * 96;
    expect(firstLine - second.y).toBeGreaterThan(margin - 8);
    expect(firstLine - second.y).toBeLessThan(margin + 8);
  });

  test("critère 3 : les feuilles ne changent ni le document, ni le fichier", async ({ page }) => {
    await start(page);
    await openDocument(page, pages(3));
    await settleLayout(page);
    const before = await topBlocks(page);
    expect(JSON.stringify(await ydocJson(page))).not.toContain("sheet");
    await button(page, "Enregistrer").click();
    await expect
      .poll(async () => (await fakeFiles(page)).files["expose.nano"] ?? "")
      .toContain("cerf-volant");
    const saved = (await fakeFiles(page)).files["expose.nano"] ?? "";
    expect(saved).not.toContain("nano-sheet");
    expect(await topBlocks(page)).toEqual(before);
  });

  test("critère 4 : on écrit et on sélectionne à travers une coupure, comme dans un texte continu", async ({
    page,
  }) => {
    await start(page);
    await page.keyboard.type("Début");
    await page.keyboard.press("Enter");
    for (let index = 0; index < 45; index++) {
      await page.keyboard.insertText(`Ligne ${String(index + 1)} du cahier`);
      await page.keyboard.press("Enter");
    }
    await page.keyboard.type("Fin");
    await settleLayout(page);
    expect(await sheets(page).count()).toBeGreaterThanOrEqual(2);
    // Tout sélectionner et copier : le texte copié est continu, sans rien entre les feuilles.
    await editor(page).press("ControlOrMeta+a");
    await settleSelection(page);
    await editor(page).press("ControlOrMeta+c");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const lines = copied.split("\n").filter((line) => line !== "");
    expect(lines.slice(1, 46)).toEqual(
      Array.from({ length: 45 }, (_, index) => `Ligne ${String(index + 1)} du cahier`),
    );
    expect(copied.split("\n").filter((line) => line !== "")).toHaveLength(47);
    // Écrire au bas de la première feuille repousse le texte sur la suivante, sans rien ajouter.
    await editor(page).press("ControlOrMeta+Home");
    await waitAfterFocus(page);
    for (let index = 0; index < 5; index++) await editor(page).press("Enter");
    await settleLayout(page);
    const texts = (await topBlocks(page)).map((block) => block.content?.[0]?.text ?? "");
    expect(texts).toHaveLength(52);
    expect(texts.filter((value) => value !== "")).toHaveLength(47);
  });

  test("critère 4 : la flèche du bas passe de la dernière ligne d'une feuille à la première de la suivante", async ({
    page,
  }) => {
    await start(page);
    for (let index = 0; index < 60; index++) {
      await page.keyboard.insertText(`Ligne ${String(index + 1)}`);
      await page.keyboard.press("Enter");
    }
    await settleLayout(page);
    await editor(page).press("ControlOrMeta+Home");
    await waitAfterFocus(page);
    let previous = await sheetAtY(page, await caretTop(page));
    expect(previous).toBe(1);
    let crossed = false;
    for (let index = 0; index < 59; index++) {
      await editor(page).press("ArrowDown");
      await settleSelection(page);
      const top = await caretTop(page);
      const sheet = await sheetAtY(page, top);
      // Jamais dans l'espace gris.
      expect(sheet).toBeGreaterThan(0);
      if (sheet === 2 && previous === 1) crossed = true;
      previous = sheet;
    }
    expect(crossed).toBe(true);
    const { from } = await page.evaluate(() => {
      const element = document.querySelector(".ProseMirror") as HTMLElement & {
        editor: { state: { selection: { from: number } } };
      };
      return { from: element.editor.state.selection.from };
    });
    expect(from).toBeGreaterThan(400);
  });

  test("critère 5 : en-tête, pied de page et numéro dans les marges de chaque feuille", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, pages(3), NUMBERED);
    await settleLayout(page);
    const count = await sheets(page).count();
    expect(count).toBeGreaterThanOrEqual(3);
    const margins = page.locator(".nano-sheet-margins");
    await expect(margins).toHaveCount(count);
    for (let index = 0; index < count; index++) {
      const sheet = margins.nth(index);
      await expect(sheet.locator(".nano-margin-top")).toHaveText("Exposé de Zoé 🌾");
      await expect(sheet.locator(".nano-margin-text-number")).toHaveText(String(index + 1));
      await expect(sheet.locator(".nano-margin-bottom").first()).toHaveText("Collège");
    }
    const color = await margins
      .first()
      .locator(".nano-margin-text")
      .first()
      .evaluate((node) => getComputedStyle(node).color);
    expect(color).toBe("rgb(154, 154, 150)");
  });

  test("critère 5 : rien sur la première page quand la case le demande", async ({ page }) => {
    await start(page);
    await openDocument(page, pages(2), {
      ...NUMBERED,
      skipFirst: true,
      pageNumbers: { position: "right", skipFirst: true },
    });
    await settleLayout(page);
    await expect(page.locator('.nano-sheet-margins[data-page="1"] .nano-margin-text')).toHaveCount(
      0,
    );
    await expect(
      page.locator('.nano-sheet-margins[data-page="2"] .nano-margin-text-number'),
    ).toHaveText("2");
  });

  test("critère 6 : un saut de page termine la feuille, sa ligne « Saut de page » reste sur la feuille", async ({
    page,
  }) => {
    await start(page);
    await page.keyboard.type("Avant");
    await page.keyboard.press("ControlOrMeta+Enter");
    await page.keyboard.type("Après");
    await expect(sheets(page)).toHaveCount(2);
    const breakBox = await page.locator(".nano-editor .nano-page-break").boundingBox();
    const after = await editor(page).getByText("Après").boundingBox();
    if (!breakBox || !after) throw new Error("saut de page ou texte invisible");
    expect(await sheetAtY(page, breakBox.y + breakBox.height / 2)).toBe(1);
    expect(await sheetAtY(page, after.y)).toBe(2);
  });

  test("critère 7 : le compteur « Page 2 sur 3 » suit la feuille au milieu de la fenêtre, sans trait en pointillé", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, pages(3));
    await settleLayout(page);
    await expect(page.locator(".nano-page-mark")).toHaveCount(0);
    await page.evaluate(() => {
      const sheet = document.querySelectorAll(".nano-sheet")[1] as HTMLElement;
      const box = sheet.getBoundingClientRect();
      window.scrollBy(0, box.top + box.height / 2 - window.innerHeight / 2);
    });
    await expect(page.locator(".nano-page-counter")).toHaveText(/^Page 2 sur \d+$/);
  });

  test("critère 10 : la recherche amène le texte trouvé dans une feuille, jamais dans l'espace gris ni sous la barre", async ({
    page,
  }) => {
    await start(page);
    const content = pages(3);
    content.splice(10, 0, {
      type: "paragraph",
      attrs: { id: "cible" },
      content: [{ type: "text", text: "Mot introuvable ailleurs" }],
    });
    await openDocument(page, content);
    await settleLayout(page);
    await editor(page).press("ControlOrMeta+f");
    await page.getByRole("textbox", { name: "Rechercher", exact: true }).fill("introuvable");
    await page.keyboard.press("Enter");
    const match = page.locator(".nano-search-match").first();
    await expect(match).toBeInViewport();
    const box = await match.boundingBox();
    const bar = await page.getByRole("toolbar", { name: "Mise en forme" }).boundingBox();
    if (!box || !bar) throw new Error("occurrence ou barre invisible");
    expect(box.y).toBeGreaterThan(bar.y + bar.height);
    expect(await sheetAtY(page, box.y + box.height / 2)).toBeGreaterThan(0);
  });

  test("critère 11 : l'impression ne change pas : ni feuilles ni espaces, même nombre de pages", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, pages(3), NUMBERED);
    await settleLayout(page);
    const shown = await sheets(page).count();
    const pdf = await printToPdf(page);
    expect(pdfPageCount(pdf)).toBe(shown);
    pdfPagesText(pdf).forEach((text, index) => {
      expect(text.split("\n")).toContain(String(index + 1));
    });
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".nano-sheets")).toBeHidden();
    await expect(page.locator(".nano-editor .nano-sheet-gap").first()).toBeHidden();
    await page.emulateMedia({ media: null });
  });
});
