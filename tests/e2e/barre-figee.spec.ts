// Tests d'interface du ticket M1 (barre d'outils figée), dans Chromium : l'en-tête et la barre de
// mise en forme restent en haut de la fenêtre quand la page défile, sans rien cacher.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { enableAssistant, fakeProvider } from "./assistantHelpers";
import { setFakeFiles } from "./fakeFileStore";
import { button, editor, pasteFromOtherApp, start } from "./formatHelpers";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

/** Hauteur d'une feuille A4 à l'écran (29,7 cm du CSS). */
const A4_HEIGHT_PX = (29.7 / 2.54) * 96;

function formatBar(page: Page) {
  return page.getByRole("toolbar", { name: "Mise en forme" });
}

/** Colle un document d'au moins dix pages et place le curseur à la fin. */
async function writeTenPages(page: Page) {
  const paragraphs = Array.from(
    { length: 300 },
    (_, index) =>
      `Paragraphe ${String(index + 1)} : une ligne de texte assez longue pour remplir la largeur de la page.`,
  );
  await pasteFromOtherApp(
    page,
    paragraphs.map((text) => `<p>${text}</p>`).join(""),
    paragraphs.join("\n"),
  );
  await expect(editor(page).locator("p").last()).toContainText("Paragraphe 300");
  const height = await page.locator(".nano-page").evaluate((element) => element.scrollHeight);
  expect(height).toBeGreaterThan(10 * A4_HEIGHT_PX);
}

/** Fait défiler la fenêtre tout en bas, et renvoie la position atteinte. */
async function scrollToBottom(page: Page): Promise<number> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1 &&
          window.scrollY > 0,
      ),
    )
    .toBe(true);
  return page.evaluate(() => window.scrollY);
}

async function box(locator: Locator) {
  const result = await locator.boundingBox();
  if (!result) throw new Error("élément invisible");
  return result;
}

/** Bas de la barre de mise en forme, en pixels depuis le haut de la fenêtre. */
async function barBottom(page: Page): Promise<number> {
  const bar = await box(formatBar(page));
  return bar.y + bar.height;
}

/** Rectangle du curseur (sélection repliée) dans la fenêtre. */
function caretRect(page: Page) {
  return page.evaluate(() => {
    const range = window.getSelection()?.getRangeAt(0);
    if (!range) throw new Error("pas de sélection");
    const rect = range.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  });
}

/** Vrai si l'élément affiché au point donné fait partie de la partie figée, pas de la page. */
function stickyPartAt(page: Page, x: number, y: number) {
  return page.evaluate(
    ([px, py]) => Boolean(document.elementFromPoint(px, py)?.closest(".nano-top")),
    [x, y] as const,
  );
}

test("critère A : en bas d'un long document, l'en-tête et la barre restent en haut de la fenêtre, sur leur fond", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page);
  await writeTenPages(page);
  await scrollToBottom(page);
  const header = await box(page.getByRole("banner"));
  expect(header.y).toBe(0);
  await expect(formatBar(page)).toBeInViewport({ ratio: 1 });
  const bar = await box(formatBar(page));
  expect(bar.y).toBeGreaterThan(header.y + header.height - 1);
  // Le texte de la page passe dessous sans se lire à travers : au milieu de la barre, à côté d'elle
  // et juste sous elle, c'est la partie figée qui s'affiche, avec le fond de l'application.
  const page_ = await box(page.locator(".nano-page"));
  expect(await stickyPartAt(page, bar.x + bar.width / 2, bar.y + bar.height / 2)).toBe(true);
  expect(await stickyPartAt(page, page_.x + 4, bar.y + bar.height / 2)).toBe(true);
  expect(await stickyPartAt(page, page_.x + 4, bar.y + bar.height + 4)).toBe(true);
  await expect(page.locator(".nano-top")).toHaveCSS("background-color", "rgb(236, 236, 234)");
  await expect(page.locator(".nano-format-bar")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator(".nano-format-bar")).not.toHaveCSS("box-shadow", "none");
});

test("critère E : dans un document de 10 pages, Gras s'utilise en bas sans remonter, et le texte tapé reste visible sous la barre", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page);
  await writeTenPages(page);
  await page.keyboard.press("ControlOrMeta+End");
  const bottom = await scrollToBottom(page);
  const bold = button(page, "Gras");
  await expect(bold).toBeInViewport({ ratio: 1 });
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => window.scrollY)).toBe(bottom);
  await page.keyboard.type(" et la fin en gras");
  const typed = editor(page).locator("strong").last();
  await expect(typed).toHaveText("et la fin en gras");
  await expect(typed).toBeInViewport({ ratio: 1 });
  expect((await box(typed)).y).toBeGreaterThanOrEqual(await barBottom(page));
});

test("critère B : le curseur qui remonte au clavier n'est jamais caché par la barre", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page);
  await writeTenPages(page);
  await page.keyboard.press("ControlOrMeta+End");
  await scrollToBottom(page);
  for (let line = 0; line < 40; line += 1) {
    await page.keyboard.press("ArrowUp");
  }
  await expect.poll(async () => (await caretRect(page)).top >= (await barBottom(page))).toBe(true);
  // Et en redescendant, le curseur reste dans la fenêtre.
  for (let line = 0; line < 40; line += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await expect.poll(async () => (await caretRect(page)).bottom <= 800).toBe(true);
});

test("critère B : la recherche s'affiche sous la barre figée, et l'occurrence trouvée n'est pas cachée", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page);
  await writeTenPages(page);
  await scrollToBottom(page);
  await page.keyboard.press("ControlOrMeta+f");
  const search = page.getByRole("search", { name: "Rechercher dans le document" });
  await expect(search).toBeInViewport({ ratio: 1 });
  const searchBox = await box(search);
  expect(searchBox.y).toBeGreaterThanOrEqual(await barBottom(page));
  // Une occurrence tout en haut du document : la page remonte, l'occurrence s'arrête sous la recherche.
  await page.keyboard.type("Paragraphe 3 :");
  const active = editor(page).locator(".nano-search-match-active");
  await expect(active).toBeInViewport({ ratio: 1 });
  const found = await box(active);
  expect(found.y).toBeGreaterThanOrEqual(searchBox.y + searchBox.height);
});

test("critère B : la grille de couleurs s'ouvre sous la barre figée, par-dessus la page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page);
  await writeTenPages(page);
  await scrollToBottom(page);
  await button(page, "Couleur du texte").click();
  const grid = page.getByRole("group", { name: "Couleurs du texte" });
  await expect(grid).toBeInViewport({ ratio: 1 });
  // Juste sous son bouton, par-dessus la page : rien ne la recouvre.
  const gridBox = await box(grid);
  const buttonBox = await box(button(page, "Couleur du texte"));
  expect(gridBox.y).toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height);
  for (const [x, y] of [
    [gridBox.x + 6, gridBox.y + 6],
    [gridBox.x + gridBox.width - 6, gridBox.y + gridBox.height - 6],
  ] as const) {
    expect(await stickyPartAt(page, x, y)).toBe(true);
    expect(
      await page.evaluate(
        ([px, py]) => Boolean(document.elementFromPoint(px, py)?.closest(".nano-popover")),
        [x, y] as const,
      ),
    ).toBe(true);
  }
});

test("critère B : un message reste visible en haut de la fenêtre, avec la barre", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page);
  await writeTenPages(page);
  await scrollToBottom(page);
  await setFakeFiles(page, { nextSaveFails: true });
  await page.keyboard.press("ControlOrMeta+s");
  const message = page.locator(".nano-message");
  await expect(message).toBeInViewport({ ratio: 1 });
  await expect(formatBar(page)).toBeInViewport({ ratio: 1 });
  const messageBox = await box(message);
  expect((await box(formatBar(page))).y).toBeGreaterThanOrEqual(messageBox.y + messageBox.height);
});

test("critère B : en bas d'un long document, le panneau de l'assistant s'affiche avec la barre, et ses boutons ne passent pas sur elle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await enableAssistant(page);
  await fakeProvider(page, "anthropic", () => ({
    paragraphs: ["Les enfants jouent dans le jardin."],
  }));
  await start(page);
  await page.keyboard.type("Les enfant joue dans le jardin.");
  await page.keyboard.press("Enter");
  await writeTenPages(page);
  // Le premier paragraphe est sélectionné, puis la page défile tout en bas avant « Corriger ».
  await editor(page).locator("p").first().click({ clickCount: 3 });
  await scrollToBottom(page);
  await button(page, "Corriger").click();
  const panel = page.getByRole("region", { name: "Modifications proposées" });
  await expect(panel).toBeInViewport({ ratio: 1 });
  // La modification choisie, en haut du document, passe sous la partie figée : ses boutons
  // disparaissent avec elle, puis reviennent quand elle redescend sous la barre.
  const actions = page.getByRole("group", { name: /Modification choisie/ });
  const top = await editor(page)
    .locator(".nano-suggest-active")
    .first()
    .evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
  await page.evaluate((y) => window.scrollTo(0, y), top - 40);
  await expect(actions).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(actions).toBeVisible();
});

test("critère C : dans une fenêtre de moins de 500 px de haut, seule la barre reste figée, sans l'en-tête", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 450 });
  await start(page);
  await writeTenPages(page);
  await scrollToBottom(page);
  await expect(page.getByRole("banner")).not.toBeInViewport();
  await expect(formatBar(page)).toBeInViewport({ ratio: 1 });
  expect((await box(formatBar(page))).y).toBeLessThan(20);
  // Le curseur et l'occurrence trouvée ne s'arrêtent pas sous la barre, même ici.
  await page.keyboard.press("ControlOrMeta+End");
  for (let line = 0; line < 20; line += 1) await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await caretRect(page)).top >= (await barBottom(page))).toBe(true);
  await page.keyboard.press("ControlOrMeta+f");
  await page.keyboard.type("Paragraphe 3 :");
  const active = editor(page).locator(".nano-search-match-active");
  await expect(active).toBeInViewport({ ratio: 1 });
  const search = await box(page.getByRole("search", { name: "Rechercher dans le document" }));
  expect((await box(active)).y).toBeGreaterThanOrEqual(search.y + search.height);
});

test("critère C : à 390 px de large, rien ne déborde, et la barre sur deux lignes reste figée", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await writeTenPages(page);
  await scrollToBottom(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  await expect(formatBar(page)).toBeInViewport({ ratio: 1 });
  expect((await box(formatBar(page))).height).toBeGreaterThan(80);
  await expect(button(page, "Gras")).toBeInViewport({ ratio: 1 });
  // L'en-tête, sur plusieurs lignes à cette largeur, défile avec la page (choix à confirmer).
  await expect(page.getByRole("banner")).not.toBeInViewport();
});

test("critère D : à l'impression, la partie figée ne s'imprime pas et la page reste seule", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Une lettre.");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".nano-top")).toBeHidden();
  await expect(formatBar(page)).toBeHidden();
  await expect(editor(page)).toBeVisible();
});
