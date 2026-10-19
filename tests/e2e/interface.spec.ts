// Tests d'interface du ticket U1a (structure de l'interface et polices intégrées), dans Chromium.
// Les valeurs attendues viennent de la charte docs/design/README.md. Les fichiers passent par la
// fausse implémentation de FileStore (fakeFileStore.ts).
import { expect, test, type Locator, type Page } from "@playwright/test";
import { installFakeFileStore, setFakeFiles } from "./fakeFileStore";
import { watchNetwork } from "./networkWatch";

const INK = "rgb(18, 18, 18)";
const WHITE = "rgb(255, 255, 255)";
const APP_BACKGROUND = "rgb(236, 236, 234)";

function editor(page: Page) {
  return page.getByRole("textbox", { name: "Document" });
}

function button(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

/** Valeur calculée d'une propriété CSS. */
function style(locator: Locator, property: string): Promise<string> {
  return locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property,
  );
}

/** Abscisse gauche de chaque élément, pour vérifier leur ordre à l'écran. */
async function lefts(locators: Locator[]): Promise<number[]> {
  const boxes = await Promise.all(locators.map((locator) => locator.boundingBox()));
  return boxes.map((box) => box?.x ?? Number.NaN);
}

/** Vrai si la page défile horizontalement. */
function overflowsHorizontally(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.beforeEach(async ({ page }) => {
  await installFakeFileStore(page);
});

test("critère 1 : l'en-tête contient le logo et le nom, le nom du document, puis le groupe Fichier dans l'ordre de la maquette", async ({
  page,
}) => {
  await page.goto("/");
  const header = page.getByRole("banner");
  const brand = header.getByRole("heading", { name: "Nano Buro" });
  const title = header.getByText("Sans titre", { exact: true });
  const fileGroup = header.getByRole("toolbar", { name: "Fichier" });
  await expect(brand).toBeVisible();
  await expect(title).toBeVisible();
  await expect(fileGroup).toBeVisible();

  const xs = await lefts([brand, title, fileGroup]);
  expect([...xs].sort((a, b) => a - b)).toEqual(xs);

  const names = ["Nouveau", "Ouvrir…", "Enregistrer sous…", "Enregistrer"];
  const buttons = await lefts(
    names.map((name) => fileGroup.getByRole("button", { name, exact: true })),
  );
  expect([...buttons].sort((a, b) => a - b)).toEqual(buttons);
});

test("critère 1 : « Enregistrer » est le bouton principal, sur fond noir, avec son raccourci affiché", async ({
  page,
}) => {
  await page.goto("/");
  const save = button(page, "Enregistrer");
  await expect(save).toHaveCount(1);
  await expect(save).toContainText(/⌘S|Ctrl\+S/);
  expect(await style(save, "background-color")).toBe(INK);
  expect(await style(save, "color")).toBe(WHITE);
  expect(await style(button(page, "Enregistrer sous…"), "background-color")).not.toBe(INK);
});

test("critère 2 : un document jamais enregistré affiche « Sans titre » et aucun nom de fichier", async ({
  page,
}) => {
  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(header.getByText("Sans titre", { exact: true })).toBeVisible();
  await expect(header).not.toContainText(".nano");
});

test("critère 1 : après un enregistrement, l'en-tête affiche le nom du document et le nom du fichier", async ({
  page,
}) => {
  await page.goto("/");
  await editor(page).click();
  await page.keyboard.type("Liste de courses");
  await setFakeFiles(page, { nextSaveName: "courses de Noël 🎄.nano" });
  await button(page, "Enregistrer").click();

  const header = page.getByRole("banner");
  await expect(header.getByText("courses de Noël 🎄", { exact: true })).toBeVisible();
  await expect(header.getByText("courses de Noël 🎄.nano", { exact: true })).toBeVisible();
  await expect(header.getByText("Sans titre", { exact: true })).toHaveCount(0);
});

test("critère 3 : la barre de mise en forme flotte sous l'en-tête, centrée, avec Annuler, Rétablir, Gras, Italique", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const bar = page.getByRole("toolbar", { name: "Mise en forme" });
  const barBox = await bar.boundingBox();
  const headerBox = await page.getByRole("banner").boundingBox();
  if (!barBox || !headerBox) throw new Error("barre ou en-tête invisible");
  expect(barBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);
  expect(Math.abs(barBox.x + barBox.width / 2 - 720)).toBeLessThanOrEqual(2);
  expect(await style(bar, "box-shadow")).not.toBe("none");

  const names = ["Annuler", "Rétablir", "Gras", "Italique"];
  const xs = await lefts(names.map((name) => bar.getByRole("button", { name, exact: true })));
  expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  await expect(bar.getByRole("separator")).toHaveCount(1);
});

test("critère 3 : Gras et Italique activés sont sur fond noir, texte blanc", async ({ page }) => {
  await page.goto("/");
  await editor(page).click();
  const bold = button(page, "Gras");
  const italic = button(page, "Italique");
  expect(await style(bold, "background-color")).not.toBe(INK);

  await page.keyboard.press("ControlOrMeta+B");
  await page.keyboard.press("ControlOrMeta+I");
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(italic).toHaveAttribute("aria-pressed", "true");
  for (const pressed of [bold, italic]) {
    expect(await style(pressed, "background-color")).toBe(INK);
    expect(await style(pressed, "color")).toBe(WHITE);
  }
});

test("critère 4 : le document est une page blanche centrée, d'au plus 794 px, avec une ombre, sur le fond gris", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const pageSheet = page.locator(".nano-page");
  const box = await pageSheet.boundingBox();
  if (!box) throw new Error("page du document invisible");
  expect(box.width).toBeLessThanOrEqual(794);
  expect(box.width).toBeGreaterThan(700);
  expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThanOrEqual(2);
  expect(await style(pageSheet, "background-color")).toBe(WHITE);
  expect(await style(pageSheet, "box-shadow")).toContain("rgba(0, 0, 0, 0.08)");
  expect(await style(page.locator("body"), "background-color")).toBe(APP_BACKGROUND);
  await expect(pageSheet.getByRole("textbox", { name: "Document" })).toBeVisible();
});

test("critère 5 : le pied de page affiche « Copie de secours à jour » et « Fonctionne hors ligne »", async ({
  page,
}) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText("Copie de secours à jour");
  await expect(footer).toContainText("Fonctionne hors ligne");
});

test("critère 6 : IBM Plex Sans et Mono sont chargées depuis l'application, sans autre domaine", async ({
  page,
  baseURL,
}) => {
  const log = watchNetwork(page);
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);

  expect(await style(editor(page), "font-family")).toMatch(/^"?IBM Plex Sans"?/);
  expect(await style(page.getByRole("contentinfo"), "font-family")).toMatch(/^"?IBM Plex Mono"?/);
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((font) => font.status === "loaded").map((font) => font.family),
  );
  expect(loaded.map((family) => family.replace(/"/g, ""))).toEqual(
    expect.arrayContaining(["IBM Plex Sans", "IBM Plex Mono"]),
  );

  const origin = new URL(baseURL ?? page.url()).origin;
  const fonts = log.requests.filter(({ url }) => /\.(woff2?|ttf|otf)(\?|$)/.test(url));
  expect(fonts.length).toBeGreaterThan(0);
  expect(fonts.filter(({ url }) => new URL(url).origin !== origin)).toEqual([]);
  expect(log.requests.filter(({ url }) => new URL(url).origin !== origin)).toEqual([]);
});

test("critère 7 : les noms accessibles des boutons ne changent pas, et les boutons à icône ont un aria-label", async ({
  page,
}) => {
  await page.goto("/");
  for (const name of [
    "Gras",
    "Italique",
    "Annuler",
    "Rétablir",
    "Nouveau",
    "Ouvrir…",
    "Enregistrer",
    "Enregistrer sous…",
  ]) {
    await expect(button(page, name)).toHaveCount(1);
  }
  await expect(button(page, "Annuler")).toHaveAttribute("aria-label", "Annuler");
  await expect(button(page, "Rétablir")).toHaveAttribute("aria-label", "Rétablir");
});

test("critère 9 : à 390 px de large, rien ne déborde horizontalement", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await overflowsHorizontally(page)).toBe(false);

  // Cas limites : un mot très long dans le document et un nom de fichier très long dans l'en-tête.
  await editor(page).click();
  await page.keyboard.type("Anticonstitutionnellement".repeat(8));
  await setFakeFiles(page, { nextSaveName: `${"très-long-nom-de-fichier-".repeat(6)}.nano` });
  await button(page, "Enregistrer").click();
  await expect(page.getByRole("banner")).toContainText("très-long-nom-de-fichier-");
  expect(await overflowsHorizontally(page)).toBe(false);

  const fileGroup = await page.getByRole("toolbar", { name: "Fichier" }).boundingBox();
  const bar = await page.getByRole("toolbar", { name: "Mise en forme" }).boundingBox();
  for (const box of [fileGroup, bar]) {
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  }
});
