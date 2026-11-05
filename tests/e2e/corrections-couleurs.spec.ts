// Tests d'interface du ticket T2.22 (corrections de l'assistant en rouge et en vert), dans Chromium,
// avec le faux fournisseur des tests de T3.1 (assistantHelpers.ts).
import { expect, test, type Locator, type Page } from "@playwright/test";
import { enableAssistant, fakeProvider } from "./assistantHelpers";
import { button, editor, selectText, start } from "./formatHelpers";

const FAULTY = "Les enfant joue dans le jardin.";
const FIXED = "Les enfants jouent dans le jardin.";

const RED = "rgb(198, 40, 40)";
const RED_BACKGROUND = "rgb(253, 236, 234)";
const GREEN = "rgb(46, 125, 50)";
const GREEN_BACKGROUND = "rgb(232, 245, 233)";

function removed(page: Page) {
  return editor(page).locator(".nano-suggest-removed");
}

function inserted(page: Page) {
  return editor(page).locator(".nano-suggest-inserted");
}

/** Couleur, fond et décoration calculés d'une marque. */
function look(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.color,
      background: style.backgroundColor,
      decoration: style.textDecorationLine,
    };
  });
}

/** Toutes les couleurs calculées dans le document, texte et fonds. */
function documentColors(page: Page) {
  return editor(page).evaluate((root) => {
    const colors = new Set<string>();
    for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
      const style = getComputedStyle(element);
      if (style.display === "none") continue;
      colors.add(style.color);
      colors.add(style.backgroundColor);
    }
    return [...colors];
  });
}

async function correct(page: Page) {
  await page.keyboard.type(FAULTY);
  await page.keyboard.press("ControlOrMeta+A");
  await button(page, "Corriger").click();
  await expect(removed(page)).toHaveText(["enfant", "joue"]);
}

test.describe("T2.22 : corrections en rouge et en vert", () => {
  test.beforeEach(async ({ page }) => {
    await enableAssistant(page);
    await fakeProvider(page, "anthropic", () => ({ paragraphs: [FIXED] }));
  });

  test("critères 1 et 3 : le texte retiré est en rouge, barré, sur un fond rouge très clair", async ({
    page,
  }) => {
    await start(page);
    await correct(page);
    expect(await look(removed(page).last())).toEqual({
      color: RED,
      background: RED_BACKGROUND,
      decoration: "line-through",
    });
  });

  test("critères 2 et 3 : le texte proposé est en vert, souligné, sur un fond vert très clair", async ({
    page,
  }) => {
    await start(page);
    await correct(page);
    await expect(inserted(page)).toHaveText(["enfants", "jouent"]);
    expect(await look(inserted(page).last())).toEqual({
      color: GREEN,
      background: GREEN_BACKGROUND,
      decoration: "underline",
    });
  });

  test("critère 5 : la modification choisie garde son cadre noir", async ({ page }) => {
    await start(page);
    await correct(page);
    const active = inserted(page).first();
    await expect(active).toHaveClass(/nano-suggest-active/);
    await expect(active).toHaveCSS("outline-color", "rgb(18, 18, 18)");
    await expect(active).toHaveCSS("outline-style", "solid");
  });

  test("critère 6 : plus aucune marque ni couleur après « Tout accepter » ou « Tout refuser »", async ({
    page,
  }) => {
    await start(page);
    await correct(page);
    await button(page, "Tout accepter").click();
    await expect(removed(page)).toHaveCount(0);
    await expect(inserted(page)).toHaveCount(0);
    expect(await documentColors(page)).not.toEqual(expect.arrayContaining([RED]));
    expect(await documentColors(page)).not.toEqual(expect.arrayContaining([GREEN]));
    await page.keyboard.press("ControlOrMeta+A");
    await button(page, "Corriger").click();
    await expect(page.getByText("Aucune faute trouvée dans la sélection.")).toBeVisible();
  });

  test("critère 6 : « Tout refuser » retire le rouge et le vert", async ({ page }) => {
    await start(page);
    await correct(page);
    await button(page, "Tout refuser").click();
    await expect(removed(page)).toHaveCount(0);
    const colors = await documentColors(page);
    expect(colors).not.toContain(RED);
    expect(colors).not.toContain(GREEN);
    expect(colors).not.toContain(RED_BACKGROUND);
    expect(colors).not.toContain(GREEN_BACKGROUND);
  });

  test("critère 6 : rien de rouge ni de vert dans l'aperçu avant impression", async ({ page }) => {
    await start(page);
    await correct(page);
    await page.emulateMedia({ media: "print" });
    const colors = await documentColors(page);
    expect(colors).not.toContain(RED);
    expect(colors).not.toContain(GREEN);
    expect(colors).not.toContain(RED_BACKGROUND);
    expect(colors).not.toContain(GREEN_BACKGROUND);
    await expect(inserted(page).first()).toBeHidden();
    await expect(removed(page).first()).toHaveCSS("text-decoration-line", "none");
  });

  test("critère 7 : un texte en couleur prend le rouge pendant la correction, puis retrouve sa couleur", async ({
    page,
  }) => {
    await start(page);
    await page.keyboard.type(FAULTY);
    await selectText(page, "joue");
    await button(page, "Couleur du texte").click();
    await page
      .getByRole("group", { name: /^Couleurs/ })
      .getByRole("button", { name: "Bleu" })
      .click();
    const blue = editor(page).locator("span", { hasText: "joue" }).first();
    const blueColor = await blue.evaluate((element) => getComputedStyle(element).color);
    await page.keyboard.press("ControlOrMeta+A");
    await button(page, "Corriger").click();
    await expect(removed(page).last()).toHaveText("joue");
    await expect(removed(page).last()).toHaveCSS("color", RED);
    await button(page, "Tout refuser").click();
    await expect(removed(page)).toHaveCount(0);
    await expect(editor(page).locator("span", { hasText: "joue" }).first()).toHaveCSS(
      "color",
      blueColor,
    );
  });
});

test("critère 6 : assistant éteint, aucune de ces couleurs n'apparaît", async ({ page }) => {
  await start(page);
  await page.keyboard.type(FAULTY);
  await page.keyboard.press("ControlOrMeta+A");
  await expect(page.getByRole("button", { name: "Corriger" })).toHaveCount(0);
  const colors = await page.locator("body").evaluate(() => {
    const found = new Set<string>();
    for (const element of Array.from(document.querySelectorAll("*"))) {
      const style = getComputedStyle(element);
      found.add(style.color);
      found.add(style.backgroundColor);
    }
    return [...found];
  });
  for (const color of [RED, GREEN, RED_BACKGROUND, GREEN_BACKGROUND]) {
    expect(colors).not.toContain(color);
  }
});
