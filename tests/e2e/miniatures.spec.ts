// Tests d'interface du ticket PL6 (vue des pages en miniatures, critères 12 à 17), dans Chromium : bouton près du
// compteur, une miniature par feuille avec son numéro, cadre sur la page du curseur, clic qui amène en haut de la page,
// Échap et « Fermer » sans bouger, clavier, lecture seule, ouverture rapide sur 100 pages, aide.
import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_HEADER_FOOTER } from "../../src/core/headerFooter";
import { fakeFiles } from "./fakeFileStore";
import { editor, start, ydocJson } from "./formatHelpers";
import { openDocument, pages, settleLayout } from "./pageHelpers";

function pagesView(page: Page) {
  return page.getByRole("dialog", { name: "Vue des pages" });
}

function thumbnail(page: Page, number: number) {
  return pagesView(page).getByRole("button", { name: `Page ${String(number)}`, exact: true });
}

async function openPagesView(page: Page) {
  await page.getByRole("button", { name: "Vue des pages", exact: true }).click();
  await expect(pagesView(page)).toBeVisible();
}

/** Haut de la feuille `number` dans la fenêtre. */
async function sheetTop(page: Page, number: number): Promise<number> {
  const box = await page.locator(`.nano-sheet[data-page="${String(number)}"]`).boundingBox();
  if (!box) throw new Error(`feuille ${String(number)} invisible`);
  return box.y;
}

/** Bas de la partie figée en haut de la fenêtre. */
async function stickyBottom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const bar = document.querySelector(".nano-top");
    return bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
  });
}

test.describe("PL6 : vue des pages en miniatures", () => {
  test("critère 12 : le bouton « Vue des pages » est à côté du compteur de pages", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, pages(3));
    await settleLayout(page);
    const counter = await page.locator(".nano-page-counter").boundingBox();
    const viewButton = await page
      .getByRole("button", { name: "Vue des pages", exact: true })
      .boundingBox();
    expect(counter && viewButton).toBeTruthy();
    if (!counter || !viewButton) return;
    expect(
      Math.abs(viewButton.y + viewButton.height / 2 - (counter.y + counter.height / 2)),
    ).toBeLessThan(8);
    expect(viewButton.x - (counter.x + counter.width)).toBeLessThan(40);
  });

  test("critère 13 : une miniature d'environ 160 px par feuille, numérotée, la page du curseur encadrée", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, pages(3));
    await settleLayout(page);
    await editor(page).press("ControlOrMeta+End");
    await openPagesView(page);
    const thumbnails = pagesView(page).locator(".nano-thumbnail");
    await expect(thumbnails).toHaveCount(await page.locator(".nano-sheet").count());
    await expect(pagesView(page)).toContainText("3 pages");
    const frame = await pagesView(page).locator(".nano-thumbnail-frame").first().boundingBox();
    expect(frame?.width ?? 0).toBeGreaterThan(150);
    expect(frame?.width ?? 0).toBeLessThan(170);
    // A4 réduit : hauteur ≈ 1,414 × largeur.
    expect((frame?.height ?? 0) / (frame?.width ?? 1)).toBeCloseTo(297 / 210, 1);
    for (const number of [1, 2, 3]) {
      await expect(thumbnail(page, number)).toContainText(String(number));
    }
    await expect(thumbnail(page, 3)).toHaveAttribute("aria-current", "page");
    await expect(thumbnail(page, 1)).not.toHaveAttribute("aria-current", "page");
    // La miniature reprend le texte de sa feuille.
    await expect(thumbnail(page, 1).locator(".nano-thumbnail-content")).toContainText(
      "cerf-volant",
    );
  });

  test("critère 13 : la miniature montre l'en-tête et le numéro de sa feuille", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, pages(2), {
      ...DEFAULT_HEADER_FOOTER,
      pageNumbers: { position: "right", skipFirst: false },
      header: { text: "Exposé de Zoé 🌾", align: "left" },
    });
    await settleLayout(page);
    await openPagesView(page);
    const margins = thumbnail(page, 2).locator(".nano-sheet-margins");
    await expect(margins).toContainText("Exposé de Zoé 🌾");
    await expect(margins).toContainText("2");
  });

  test("critère 14 : un clic sur une miniature amène en haut de la page, sous la barre, le curseur dans la page", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, pages(4));
    await settleLayout(page);
    await openPagesView(page);
    await thumbnail(page, 3).click();
    await expect(pagesView(page)).toBeHidden();
    const top = await sheetTop(page, 3);
    const bar = await stickyBottom(page);
    expect(top).toBeGreaterThanOrEqual(bar);
    expect(top - bar).toBeLessThan(40);
    await expect(editor(page)).toBeFocused();
    // Le curseur est sur la page 3 : le compteur et une nouvelle ouverture le disent.
    await openPagesView(page);
    await expect(thumbnail(page, 3)).toHaveAttribute("aria-current", "page");
  });

  test("critère 14 : Échap et « Fermer » ferment la vue sans bouger la page", async ({ page }) => {
    await start(page);
    await openDocument(page, pages(3));
    await settleLayout(page);
    await page.evaluate(() => window.scrollTo(0, 300));
    const before = await page.evaluate(() => window.scrollY);
    await openPagesView(page);
    await page.keyboard.press("Escape");
    await expect(pagesView(page)).toBeHidden();
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    await expect(editor(page)).toBeFocused();
    await openPagesView(page);
    await pagesView(page).getByRole("button", { name: "Fermer" }).click();
    await expect(pagesView(page)).toBeHidden();
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test("critère 15 : au clavier, les flèches passent d'une miniature à l'autre et Entrée va à la page", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, pages(4));
    await settleLayout(page);
    await editor(page).press("ControlOrMeta+Home");
    await openPagesView(page);
    await expect(thumbnail(page, 1)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(thumbnail(page, 2)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(thumbnail(page, 1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(thumbnail(page, 4)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(thumbnail(page, 1)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(pagesView(page)).toBeHidden();
    const top = await sheetTop(page, 2);
    expect(top).toBeGreaterThanOrEqual(await stickyBottom(page));
    expect(top - (await stickyBottom(page))).toBeLessThan(40);
  });

  test("critère 15 : la vue est en lecture seule, ni imprimée ni enregistrée", async ({ page }) => {
    await start(page);
    await openDocument(page, pages(2));
    await settleLayout(page);
    const before = await ydocJson(page);
    const files = (await fakeFiles(page)).files;
    await openPagesView(page);
    const content = pagesView(page).locator(".nano-thumbnail-content").first();
    await expect(content).toBeVisible();
    await expect(pagesView(page).locator("[contenteditable]")).toHaveCount(0);
    await page.keyboard.type("xyz");
    await expect(pagesView(page)).toBeVisible();
    expect(await ydocJson(page)).toEqual(before);
    await page.emulateMedia({ media: "print" });
    await expect(pagesView(page)).toBeHidden();
    await page.emulateMedia({ media: null });
    await page.keyboard.press("Escape");
    expect(await ydocJson(page)).toEqual(before);
    expect((await fakeFiles(page)).files).toEqual(files);
  });

  test("critère 16 : sur 100 pages, la vue s'ouvre en moins d'une seconde et ne dessine que les miniatures visibles", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await start(page);
    await openDocument(page, pages(100));
    await settleLayout(page);
    const sheetCount = await page.locator(".nano-sheet").count();
    expect(sheetCount).toBeGreaterThanOrEqual(100);
    const startTime = Date.now();
    await openPagesView(page);
    await expect(pagesView(page).locator(".nano-thumbnail")).toHaveCount(sheetCount);
    await expect(pagesView(page).locator('[data-drawn="true"]').first()).toBeVisible();
    expect(Date.now() - startTime).toBeLessThan(1000);
    const drawn = await pagesView(page).locator('[data-drawn="true"]').count();
    expect(drawn).toBeLessThan(sheetCount / 2);
    // En descendant, les miniatures suivantes se dessinent.
    await thumbnail(page, sheetCount).scrollIntoViewIfNeeded();
    await expect(thumbnail(page, sheetCount).locator('[data-drawn="true"]')).toHaveCount(1);
  });

  test("critère 17 : l'aide explique les feuilles et la vue des pages", async ({ page }) => {
    await start(page);
    await page.getByRole("button", { name: "Aide", exact: true }).click();
    const help = page.getByRole("complementary", { name: "Aide" });
    await expect(help).toContainText("feuille");
    await expect(help).toContainText("Vue des pages");
  });
});
