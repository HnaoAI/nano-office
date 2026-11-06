// Tests d'interface du ticket PL4 (pinceau « Reproduire la mise en forme »), dans Chromium : bouton, un clic puis
// une sélection, double clic jusqu'à Échap, mot cliqué, une étape d'annulation, tableau, liste, image, pointeur.
import { expect, test, type Page } from "@playwright/test";
import type { DocumentJson } from "../../src/core/types";
import {
  button,
  editor,
  passFocusCheck,
  settleSelection,
  start,
  topBlocks,
  waitUndoGroup,
  ydocJson,
} from "./formatHelpers";
import { insertTable } from "./tableHelpers";
import { insertWithButton, makeImage } from "./imageHelpers";

const PAINTER = "Reproduire la mise en forme";

/** Rectangle à l'écran du texte exact `text` (première occurrence) dans l'éditeur. */
async function textBox(page: Page, text: string) {
  return page.evaluate((target) => {
    const root = document.querySelector(".nano-editor");
    if (!root) throw new Error("éditeur absent");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent?.indexOf(target) ?? -1;
      if (index >= 0) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + target.length);
        const box = range.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      }
    }
    throw new Error(`texte absent : ${target}`);
  }, text);
}

/** Sélectionne `text` à la souris, en glissant du premier au dernier caractère. */
async function dragOver(page: Page, text: string) {
  const box = await textBox(page, text);
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 1, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, y, { steps: 3 });
  await page.mouse.move(box.x + box.width - 1, y, { steps: 3 });
  await page.mouse.up();
}

/** Clique au milieu du texte `text` (`clickCount` 2 pour un double clic). */
async function clickIn(page: Page, text: string, clickCount = 1) {
  const box = await textBox(page, text);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount });
}

/** Écrit des paragraphes, un par ligne. */
async function writeLines(page: Page, lines: string[]) {
  for (const [index, line] of lines.entries()) {
    if (index > 0) await page.keyboard.press("Enter");
    await page.keyboard.type(line);
  }
}

/** Marques, triées, du morceau de texte qui contient `text` (un mot retiré de sa mise en forme rejoint ses voisins). */
function marksIn(json: unknown, text: string): string[] {
  const found: string[][] = [];
  const walk = (node: unknown) => {
    if (typeof node !== "object" || node === null) return;
    const value = node as { text?: string; marks?: { type: string }[]; content?: unknown[] };
    if (value.text?.includes(text)) found.push((value.marks ?? []).map((mark) => mark.type).sort());
    value.content?.forEach(walk);
  };
  walk(json);
  if (found.length === 0) throw new Error(`texte absent : ${text}`);
  return found[0] ?? [];
}

/** Attributs `textStyle` du morceau de texte `text`. */
function textStyleOf(json: unknown, text: string): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null;
  const walk = (node: unknown) => {
    if (typeof node !== "object" || node === null || found) return;
    const value = node as {
      text?: string;
      marks?: { type: string; attrs?: Record<string, unknown> }[];
      content?: unknown[];
    };
    if (value.text?.includes(text)) {
      found = value.marks?.find((mark) => mark.type === "textStyle")?.attrs ?? {};
    }
    value.content?.forEach(walk);
  };
  walk(json);
  return found;
}

/** Met le mot `word` en gras par un double clic et Ctrl/Cmd+B. */
async function makeBold(page: Page, word: string) {
  await clickIn(page, word, 2);
  await settleSelection(page);
  await page.keyboard.press("ControlOrMeta+b");
}

/** Place le curseur dans `word`, puis clique sur le pinceau (une fois) ou double-clique (`sticky`). */
async function pickFormat(page: Page, word: string, sticky = false) {
  await clickIn(page, word);
  await settleSelection(page);
  await passFocusCheck(page);
  if (sticky) await button(page, PAINTER).dblclick();
  else await button(page, PAINTER).click();
}

test("critère 1 : le bouton suit Annuler et Rétablir, avec une icône, et reflète l'état du pinceau", async ({
  page,
}) => {
  await start(page);
  const names = await page
    .getByRole("toolbar", { name: "Mise en forme" })
    .getByRole("button")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
  expect(names.slice(0, 3)).toEqual(["Annuler", "Rétablir", PAINTER]);
  const painter = button(page, PAINTER);
  await expect(painter.locator("svg")).toBeVisible();
  await expect(painter).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.type("Bonjour");
  await painter.click();
  await expect(painter).toHaveAttribute("aria-pressed", "true");
  await painter.click();
  await expect(painter).toHaveAttribute("aria-pressed", "false");
});

test("critères 2, 3 et 6 : un clic puis une sélection à la souris applique toute la mise en forme et éteint le pinceau", async ({
  page,
}) => {
  await start(page);
  await writeLines(page, ["modèle ici", "cible là"]);
  await clickIn(page, "modèle", 2);
  await settleSelection(page);
  await page.keyboard.press("ControlOrMeta+b");
  await page.getByRole("combobox", { name: "Police" }).selectOption("EB Garamond");
  await page.getByRole("combobox", { name: "Taille" }).selectOption("16");
  await expect
    .poll(async () => textStyleOf(await ydocJson(page), "modèle"))
    .toMatchObject({
      fontFamily: "EB Garamond",
      fontSize: "16pt",
    });

  await pickFormat(page, "modèle");
  await expect(editor(page)).toHaveClass(/nano-format-painting/);
  await dragOver(page, "cible");
  await expect
    .poll(async () => marksIn(await ydocJson(page), "cible"))
    .toEqual(["bold", "textStyle"]);
  expect(textStyleOf(await ydocJson(page), "cible")).toMatchObject({
    fontFamily: "EB Garamond",
    fontSize: "16pt",
  });
  await expect(button(page, PAINTER)).toHaveAttribute("aria-pressed", "false");
  await expect(editor(page)).not.toHaveClass(/nano-format-painting/);
  await expect(editor(page)).toHaveText("modèle icicible là");
});

test("critère 4 : copier un texte normal sur un texte en gras retire le gras", async ({ page }) => {
  await start(page);
  await writeLines(page, ["normal et gras"]);
  await makeBold(page, "gras");
  await expect.poll(async () => marksIn(await ydocJson(page), "gras")).toEqual(["bold"]);
  await pickFormat(page, "normal");
  await clickIn(page, "gras");
  await expect.poll(async () => marksIn(await ydocJson(page), "gras")).toEqual([]);
});

test("critère 5 : un simple clic dans un mot applique la mise en forme à tout ce mot", async ({
  page,
}) => {
  await start(page);
  await writeLines(page, ["source", "un mot entier"]);
  await makeBold(page, "source");
  await pickFormat(page, "source");
  await clickIn(page, "ot");
  await expect.poll(async () => marksIn(await ydocJson(page), "mot")).toEqual(["bold"]);
  expect(marksIn(await ydocJson(page), "un ")).toEqual([]);
});

test("critère 5 : un triple clic applique au paragraphe entier, alignement et interligne compris", async ({
  page,
}) => {
  await start(page);
  await writeLines(page, ["centré en 1,5", "à gauche simple"]);
  await clickIn(page, "centré");
  await button(page, "Centrer").click();
  await page.getByRole("combobox", { name: "Interligne" }).selectOption("1.5");
  await pickFormat(page, "centré");
  await clickIn(page, "gauche", 3);
  await expect
    .poll(async () => (await topBlocks(page))[1]?.attrs)
    .toMatchObject({ textAlign: "center", lineHeight: "1.5" });
});

test("critère 6 : un double clic garde le pinceau actif pour plusieurs applications, jusqu'à Échap", async ({
  page,
}) => {
  await start(page);
  await writeLines(page, ["source un deux trois quatre"]);
  await makeBold(page, "source");
  await pickFormat(page, "source", true);
  const painter = button(page, PAINTER);
  await expect(painter).toHaveAttribute("aria-pressed", "true");
  for (const word of ["un", "deux", "trois"]) {
    await dragOver(page, word);
    await expect.poll(async () => marksIn(await ydocJson(page), word)).toEqual(["bold"]);
    await expect(painter).toHaveAttribute("aria-pressed", "true");
  }
  await page.keyboard.press("Escape");
  await expect(painter).toHaveAttribute("aria-pressed", "false");
  await dragOver(page, "quatre");
  await page.waitForTimeout(600);
  expect(marksIn(await ydocJson(page), " quatre")).toEqual([]);
});

test("critère 6 : en mode continu, un nouveau clic sur le bouton éteint le pinceau", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("texte");
  await pickFormat(page, "texte", true);
  const painter = button(page, PAINTER);
  await expect(painter).toHaveAttribute("aria-pressed", "true");
  await painter.click();
  await expect(painter).toHaveAttribute("aria-pressed", "false");
});

test("critère 7 : chaque application s'annule en une seule étape", async ({ page }) => {
  await start(page);
  await writeLines(page, ["source alpha beta"]);
  await makeBold(page, "source");
  await waitUndoGroup(page);
  await pickFormat(page, "source", true);
  await dragOver(page, "alpha");
  await expect.poll(async () => marksIn(await ydocJson(page), "alpha")).toEqual(["bold"]);
  await dragOver(page, "beta");
  await expect.poll(async () => marksIn(await ydocJson(page), "beta")).toEqual(["bold"]);
  await page.keyboard.press("Escape");

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => marksIn(await ydocJson(page), "beta")).toEqual([]);
  expect(marksIn(await ydocJson(page), "alpha")).toEqual(["bold"]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => marksIn(await ydocJson(page), " alpha beta")).toEqual([]);
  expect(marksIn(await ydocJson(page), "source")).toEqual(["bold"]);
});

test("critère 8 : le pinceau marche dans un tableau et dans une liste, sans changer la liste", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("source");
  await page.keyboard.press("Enter");
  await button(page, "Liste à puces").click();
  await page.keyboard.type("élément");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await insertTable(page, 1, 2);
  await page.keyboard.type("cellule");
  await makeBold(page, "source");

  await pickFormat(page, "source", true);
  await clickIn(page, "élément");
  await expect.poll(async () => marksIn(await ydocJson(page), "élément")).toEqual(["bold"]);
  await clickIn(page, "cellule");
  await expect.poll(async () => marksIn(await ydocJson(page), "cellule")).toEqual(["bold"]);
  await page.keyboard.press("Escape");
  const types = (await topBlocks(page)).map((block: DocumentJson) => block.type);
  expect(types).toContain("bulletList");
  expect(types).toContain("table");
});

test("critère 8 : un titre garde son niveau ; une image est ignorée", async ({ page }) => {
  await start(page);
  await writeLines(page, ["source", "Mon titre"]);
  await page.getByRole("combobox", { name: "Style du paragraphe" }).selectOption("2");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  const image = await makeImage(page, "photo.png", { width: 40, height: 30, type: "image/png" });
  await insertWithButton(page, [image]);
  await makeBold(page, "source");
  const before = await topBlocks(page);

  await pickFormat(page, "source", true);
  await clickIn(page, "titre");
  await expect.poll(async () => marksIn(await ydocJson(page), "titre")).toEqual(["bold"]);
  const imageBox = await page.locator(".nano-editor img").boundingBox();
  if (!imageBox) throw new Error("image invisible");
  await page.mouse.click(imageBox.x + imageBox.width / 2, imageBox.y + imageBox.height / 2);
  await page.waitForTimeout(600);
  await page.keyboard.press("Escape");
  const after = await topBlocks(page);
  expect(after[0]).toMatchObject({ type: "paragraph" });
  expect(after[1]).toMatchObject({ type: "heading", attrs: { level: 2 } });
  expect(after.find((block) => block.type === "image")).toEqual(
    before.find((block) => block.type === "image"),
  );
});

test("critère 9 : pinceau actif, le pointeur au-dessus du texte est un pinceau", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("texte");
  const cursorOf = () =>
    editor(page)
      .locator("p")
      .first()
      .evaluate((node) => getComputedStyle(node).cursor);
  expect(await cursorOf()).not.toContain("url(");
  await button(page, PAINTER).click();
  expect(await cursorOf()).toContain("url(");
  await page.keyboard.press("Escape");
  expect(await cursorOf()).not.toContain("url(");
});

test("critère 10 : allumer et éteindre le pinceau ne modifie pas le document", async ({ page }) => {
  await start(page);
  await page.keyboard.type("texte inchangé");
  const before = await ydocJson(page);
  await button(page, PAINTER).dblclick();
  await page.keyboard.press("Escape");
  expect(await ydocJson(page)).toEqual(before);
});

test("critère 5 : pinceau actif, glisser dans un texte déjà sélectionné ne le déplace pas", async ({
  page,
}) => {
  await start(page);
  await writeLines(page, ["source puis un texte sélectionné"]);
  await makeBold(page, "source");
  await pickFormat(page, "source", true);
  await clickIn(page, "sélectionné", 2);
  await expect.poll(async () => marksIn(await ydocJson(page), "sélectionné")).toEqual(["bold"]);
  await dragOver(page, "texte");
  await expect.poll(async () => marksIn(await ydocJson(page), "texte")).toEqual(["bold"]);
  await expect(editor(page)).toHaveText("source puis un texte sélectionné");
});

test("critère 11 : l'aide explique le pinceau, avec le simple et le double clic", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Aide", exact: true }).click();
  const help = page.getByRole("complementary", { name: "Aide" });
  await expect(help).toContainText("Reproduire la mise en forme");
  await expect(help).toContainText("Un clic sur le pinceau sert une seule fois");
  await expect(help).toContainText("Un double clic le garde actif");
});
