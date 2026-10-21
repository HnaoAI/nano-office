// Tests d'interface du ticket T1.7 (couleur du texte et surlignage), dans Chromium.
import { expect, test, type Page } from "@playwright/test";
import {
  button,
  editor,
  pasteFromOtherApp,
  readClipboard,
  saveAndReopen,
  selectText,
  settleSelection,
  start,
  waitUndoGroup,
  ydocJson,
} from "./formatHelpers";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const RED = "rgb(198, 40, 40)";
const YELLOW = "rgb(255, 241, 118)";

/** Couleur et fond calculés de l'élément qui porte le texte `text`. */
function colorsOf(page: Page, text: string) {
  return page.evaluate((target) => {
    const root = document.querySelector(".nano-editor");
    if (!root) throw new Error("éditeur absent");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent?.includes(target) && node.parentElement) {
        const style = getComputedStyle(node.parentElement);
        return { color: style.color, background: style.backgroundColor };
      }
    }
    throw new Error(`texte absent : ${target}`);
  }, text);
}

/** Ouvre la grille d'un bouton à la souris et choisit une pastille. */
async function pick(page: Page, buttonName: string, swatch: string) {
  await button(page, buttonName).click();
  await page
    .getByRole("group", { name: /^Couleurs/ })
    .getByRole("button", { name: swatch })
    .click();
}

/** Couleur du trait sous le « A » : `auto`, `mixed` ou la valeur choisie. */
function colorBar(page: Page) {
  return button(page, "Couleur du texte").locator(".nano-color-bar");
}

test("critère 1 : deux boutons après Gras et Italique, nommés Couleur du texte et Surlignage", async ({
  page,
}) => {
  await start(page);
  const names = await page
    .getByRole("toolbar", { name: "Mise en forme" })
    .getByRole("button")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
  const italic = names.indexOf("Italique");
  // Depuis T2.3, le bouton Barré s'intercale entre Italique et les couleurs (T2.3, critère 1).
  expect(names.slice(italic - 1, italic + 4)).toEqual([
    "Gras",
    "Italique",
    "Barré",
    "Couleur du texte",
    "Surlignage",
  ]);
  await expect(button(page, "Couleur du texte")).toContainText("A");
  await expect(button(page, "Surlignage").locator("svg")).toBeVisible();
});

test("critère 2, 3 et 4 : chaque grille montre sa palette, avec un nom par pastille, affiché au survol", async ({
  page,
}) => {
  await start(page);
  await button(page, "Couleur du texte").click();
  const textGrid = page.getByRole("group", { name: "Couleurs du texte" });
  const textNames = ["Automatique", "Gris", "Rouge", "Orange", "Vert", "Bleu", "Violet"];
  await expect(textGrid.getByRole("button")).toHaveCount(7);
  for (const name of textNames) {
    await expect(textGrid.getByRole("button", { name })).toHaveAttribute("title", name);
  }
  await expect(textGrid.getByRole("button", { name: "Rouge" })).toHaveCSS("background-color", RED);
  await page.keyboard.press("Escape");
  await button(page, "Surlignage").click();
  const highlightGrid = page.getByRole("group", { name: "Couleurs de surlignage" });
  await expect(highlightGrid.getByRole("button")).toHaveCount(5);
  for (const name of ["Aucun", "Jaune", "Vert", "Bleu", "Rose"]) {
    await expect(highlightGrid.getByRole("button", { name })).toHaveAttribute("title", name);
  }
  await expect(highlightGrid.getByRole("button", { name: "Jaune" })).toHaveCSS(
    "background-color",
    YELLOW,
  );
});

test("critère 2 : la grille se ferme après un choix, avec Échap, ou par un clic à côté", async ({
  page,
}) => {
  const target = await start(page);
  const grid = page.getByRole("group", { name: "Couleurs du texte" });
  await button(page, "Couleur du texte").click();
  await expect(grid).toBeVisible();
  await grid.getByRole("button", { name: "Rouge" }).click();
  await expect(grid).toBeHidden();

  await button(page, "Couleur du texte").click();
  await page.keyboard.press("Escape");
  await expect(grid).toBeHidden();
  await expect(button(page, "Couleur du texte")).toBeFocused();

  await button(page, "Couleur du texte").click();
  await target.click();
  await expect(grid).toBeHidden();
});

test("critère 2 : la grille se parcourt au clavier, avec les flèches et Entrée", async ({
  page,
}) => {
  const target = await start(page);
  await page.keyboard.type("Rendez-vous le 12 mai");
  await selectText(page, "12 mai");
  await button(page, "Surlignage").focus();
  await page.keyboard.press("Enter");
  const grid = page.getByRole("group", { name: "Couleurs de surlignage" });
  await expect(grid.getByRole("button", { name: "Aucun" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(grid.getByRole("button", { name: "Jaune" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(grid).toBeHidden();
  await expect(target).toBeFocused();
  expect(await colorsOf(page, "12 mai")).toMatchObject({ background: YELLOW });
  expect((await colorsOf(page, "Rendez-vous")).background).toBe("rgba(0, 0, 0, 0)");
});

test("critère 5 : la couleur et le surlignage s'appliquent à la sélection ; Automatique et Aucun les retirent", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Le prix est de 45 euros");
  await selectText(page, "45 euros");
  await pick(page, "Couleur du texte", "Rouge");
  await pick(page, "Surlignage", "Jaune");
  expect(await colorsOf(page, "45 euros")).toEqual({ color: RED, background: YELLOW });
  expect(await colorsOf(page, "Le prix")).toEqual({
    color: "rgb(27, 27, 26)",
    background: "rgba(0, 0, 0, 0)",
  });
  // La sélection reste en place après un choix : on peut enchaîner.
  await pick(page, "Couleur du texte", "Automatique");
  await pick(page, "Surlignage", "Aucun");
  expect(await colorsOf(page, "45 euros")).toEqual({
    color: "rgb(27, 27, 26)",
    background: "rgba(0, 0, 0, 0)",
  });
  expect(JSON.stringify(await ydocJson(page))).not.toMatch(/color|highlight/);
});

test("critère 5 : sans sélection, la couleur s'applique au texte tapé ensuite, comme le gras", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("noir ");
  await pick(page, "Couleur du texte", "Bleu");
  await page.keyboard.type("bleu");
  await pick(page, "Couleur du texte", "Automatique");
  await page.keyboard.type(" noir");
  expect((await colorsOf(page, "bleu")).color).toBe("rgb(21, 101, 192)");
  await expect(editor(page).locator("[data-color]")).toHaveText("bleu");
});

test("critère 6 : le trait du bouton montre la couleur sous le curseur, et reste neutre pour une sélection mélangée", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("noir ");
  await pick(page, "Couleur du texte", "Rouge");
  await page.keyboard.type("rouge");
  await expect(colorBar(page)).toHaveAttribute("data-color", "#C62828");
  await expect(colorBar(page)).toHaveCSS("background-color", RED);
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await settleSelection(page);
  await expect(colorBar(page)).toHaveAttribute("data-color", "auto");
  await page.keyboard.press("ControlOrMeta+a");
  await expect(colorBar(page)).toHaveAttribute("data-color", "mixed");
  // Le « A » lui-même reste de la couleur des autres boutons : seul le trait est coloré.
  await page.keyboard.press("End");
  await settleSelection(page);
  await expect(colorBar(page)).toHaveAttribute("data-color", "#C62828");
  const inkOf = (name: string) =>
    button(page, name).evaluate((node) => getComputedStyle(node).color);
  expect(await inkOf("Couleur du texte")).toBe(await inkOf("Italique"));
});

test("critère 7 : couleur et surlignage sont gardés à l'enregistrement et à la réouverture", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Rendez-vous le 12 mai à 45 euros");
  await selectText(page, "12 mai");
  await pick(page, "Surlignage", "Jaune");
  await selectText(page, "45 euros");
  await pick(page, "Couleur du texte", "Rouge");
  const reopened = JSON.stringify(await saveAndReopen(page));
  expect(reopened).toContain('"color":"#FFF176"');
  expect(reopened).toContain('"color":"#C62828"');
  expect(await colorsOf(page, "12 mai")).toMatchObject({ background: YELLOW });
  expect(await colorsOf(page, "45 euros")).toMatchObject({ color: RED });
});

test("critère 7 : un copier-coller dans Nano Buro garde couleur et surlignage", async ({
  page,
}) => {
  const target = await start(page);
  await page.keyboard.type("Prix 45 euros");
  await selectText(page, "45 euros");
  await pick(page, "Couleur du texte", "Vert");
  await pick(page, "Surlignage", "Rose");
  await settleSelection(page);
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("End");
  await settleSelection(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(target.locator("p")).toHaveText(["Prix 45 euros", "45 euros"]);
  const pasted = target.locator("p").last().locator("[data-color='#2E7D32']");
  await expect(pasted).toHaveText("45 euros");
  await expect(target.locator("mark[data-color='#F8BBD0']")).toHaveCount(2);
});

test("critère 7 : un collage depuis une autre application retire couleur et surlignage", async ({
  page,
}) => {
  const target = await start(page);
  await pick(page, "Couleur du texte", "Rouge");
  await pasteFromOtherApp(
    page,
    `<p><span style="color: #C62828">rouge</span> <mark>marqué</mark> <span style="background-color: #FFF176">fond</span></p>`,
  );
  await expect(target).toHaveText("rouge marqué fond");
  await expect(target.locator("mark, [data-color], [style*='color']")).toHaveCount(0);
  expect(JSON.stringify(await ydocJson(page))).not.toMatch(/color|highlight/);
});

test("critère 8 : un texte coloré copié vers un e-mail garde sa couleur", async ({ page }) => {
  await start(page);
  await page.keyboard.type("Attention : ");
  await pick(page, "Couleur du texte", "Rouge");
  await page.keyboard.type("fragile");
  await page.keyboard.press("ControlOrMeta+a");
  await settleSelection(page);
  await page.keyboard.press("ControlOrMeta+c");
  const { html, text } = await readClipboard(page);
  expect(html).toMatch(/<span[^>]*style="color: rgb\(198, 40, 40\);?"[^>]*>fragile<\/span>/);
  expect(text).toContain("Attention : fragile");
});

test("Ctrl/Cmd+Z annule une couleur en une seule fois", async ({ page }) => {
  await start(page);
  await page.keyboard.type("mot");
  await waitUndoGroup(page);
  await page.keyboard.press("ControlOrMeta+a");
  await settleSelection(page);
  await pick(page, "Couleur du texte", "Violet");
  await expect(editor(page).locator("[data-color]")).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor(page).locator("[data-color]")).toHaveCount(0);
  await expect(editor(page)).toHaveText("mot");
});
