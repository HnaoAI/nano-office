// Tests d'interface du ticket T0b (éditeur relié à Yjs), dans Chromium.
// Le contenu du Y.Doc est lu par window.__nanoTest, exposé en développement (src/editor/devTestHook.ts).
import { expect, test, type Page } from "@playwright/test";
import { documentSchema } from "../../src/core/schema";
import type { DocumentJson } from "../../src/core/types";

/** Ouvre l'application et place le curseur dans l'éditeur vide. */
async function openEditor(page: Page) {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Document" });
  await editor.click();
  return editor;
}

/** Contenu du Y.Doc, au format JSON de Tiptap. */
async function ydocJson(page: Page): Promise<DocumentJson> {
  return page.evaluate(() => {
    if (!window.__nanoTest) {
      throw new Error("window.__nanoTest absent : l'application doit tourner en développement");
    }
    return window.__nanoTest.documentJson();
  });
}

/** Identifiants `data-id` des paragraphes affichés. */
async function paragraphIds(page: Page): Promise<(string | null)[]> {
  return page
    .locator(".nano-editor p")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id")));
}

/** Vérifie que chaque identifiant est une chaîne non vide, sans doublon. */
function expectUniqueIds(ids: (string | null)[]) {
  for (const id of ids) {
    expect(id).toBeTruthy();
  }
  expect(new Set(ids).size).toBe(ids.length);
}

test("critère 1 : on peut saisir du texte sur plusieurs paragraphes", async ({ page }) => {
  const editor = await openEditor(page);
  await page.keyboard.type("Première ligne");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Deuxième : àéèçôœ 😀 👨‍👩‍👧");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Troisième");
  const paragraphs = editor.locator("p");
  await expect(paragraphs).toHaveText(["Première ligne", "Deuxième : àéèçôœ 😀 👨‍👩‍👧", "Troisième"]);
});

test("critère 2 : le bouton Gras et Ctrl/Cmd+B mettent la sélection en gras, un second appui le retire", async ({
  page,
}) => {
  const editor = await openEditor(page);
  const bold = page.getByRole("button", { name: "Gras" });
  await page.keyboard.type("Bonjour Élodie");
  await page.keyboard.press("ControlOrMeta+a");

  await bold.click();
  await expect(editor.locator("strong")).toHaveText("Bonjour Élodie");
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await bold.click();
  await expect(editor.locator("strong")).toHaveCount(0);
  await expect(bold).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("ControlOrMeta+b");
  await expect(editor.locator("strong")).toHaveText("Bonjour Élodie");
  await page.keyboard.press("ControlOrMeta+b");
  await expect(editor.locator("strong")).toHaveCount(0);
});

test("critère 3 : le bouton Italique et Ctrl/Cmd+I mettent la sélection en italique, un second appui le retire", async ({
  page,
}) => {
  const editor = await openEditor(page);
  const italic = page.getByRole("button", { name: "Italique" });
  await page.keyboard.type("Ça va ? 🇫🇷");
  await page.keyboard.press("ControlOrMeta+a");

  await italic.click();
  await expect(editor.locator("em")).toHaveText("Ça va ? 🇫🇷");
  await expect(italic).toHaveAttribute("aria-pressed", "true");
  await italic.click();
  await expect(editor.locator("em")).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+i");
  await expect(editor.locator("em")).toHaveText("Ça va ? 🇫🇷");
  await page.keyboard.press("ControlOrMeta+i");
  await expect(editor.locator("em")).toHaveCount(0);
});

test("critère 4 : Ctrl/Cmd+Z annule la dernière modification, Ctrl/Cmd+Shift+Z et Ctrl+Y la rétablissent", async ({
  page,
}) => {
  const editor = await openEditor(page);
  await page.keyboard.type("Texte à garder");
  // Le gestionnaire d'annulation de Yjs regroupe les frappes rapprochées : on laisse passer ce délai.
  await page.waitForTimeout(700);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+b");
  await expect(editor.locator("strong")).toHaveText("Texte à garder");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor.locator("strong")).toHaveCount(0);
  await expect(editor).toHaveText("Texte à garder");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(editor.locator("strong")).toHaveText("Texte à garder");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor.locator("strong")).toHaveCount(0);
  await page.keyboard.press("Control+y");
  await expect(editor.locator("strong")).toHaveText("Texte à garder");
});

test("critère 4 : les boutons Annuler et Rétablir", async ({ page }) => {
  const editor = await openEditor(page);
  const undo = page.getByRole("button", { name: "Annuler" });
  const redo = page.getByRole("button", { name: "Rétablir" });
  await expect(undo).toBeDisabled();
  await page.keyboard.type("Une erreur");
  await expect(editor).toHaveText("Une erreur");

  await undo.click();
  await expect(editor).toHaveText("");
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(editor).toHaveText("Une erreur");
});

test("critère 5 : le contenu est stocké dans le fragment du Y.Doc, avec le schéma partagé", async ({
  page,
}) => {
  const editor = await openEditor(page);
  await page.keyboard.type("Bonjour ");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type("Élodie");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+i");
  await page.keyboard.type("à bientôt 😀");
  await expect(editor.locator("em")).toHaveText("à bientôt 😀");

  const json = await ydocJson(page);
  // Le contenu du Y.Doc respecte le schéma partagé, sans nœud inconnu.
  const node = documentSchema.nodeFromJSON(json);
  node.check();
  expect(json.content?.map((child) => child.attrs?.id)).toEqual(await paragraphIds(page));
  // toJSON normalise les marques (Yjs y ajoute des attributs vides).
  const [first, second] = (node.toJSON() as DocumentJson).content ?? [];
  expect(first?.content).toEqual([
    { type: "text", text: "Bonjour " },
    { type: "text", text: "Élodie", marks: [{ type: "bold" }] },
  ]);
  expect(second?.content).toEqual([
    { type: "text", text: "à bientôt 😀", marks: [{ type: "italic" }] },
  ]);
});

test("critère 6 : chaque paragraphe porte un identifiant, un paragraphe créé avec Entrée en reçoit un nouveau", async ({
  page,
}) => {
  await openEditor(page);
  await page.keyboard.type("un");
  await expect.poll(() => paragraphIds(page)).toHaveLength(1);
  const [firstId] = await paragraphIds(page);
  expect(firstId).toBeTruthy();

  // Entrée en fin de paragraphe, puis au milieu, puis au début.
  await page.keyboard.press("Enter");
  await page.keyboard.type("deux trois");
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("ArrowLeft");
  }
  await page.keyboard.press("Enter");
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");

  const ids = await paragraphIds(page);
  expect(ids).toHaveLength(4);
  expectUniqueIds(ids);
  expect(ids[0]).toBe(firstId);

  // Les identifiants ne changent pas quand on continue d'écrire.
  await page.keyboard.type("encore");
  expect(await paragraphIds(page)).toEqual(ids);
  // Ils sont aussi enregistrés dans le Y.Doc.
  expect((await ydocJson(page)).content?.map((node) => node.attrs?.id)).toEqual(ids);
});

test("critère 7 : le correcteur orthographique du navigateur est actif dans l'éditeur", async ({
  page,
}) => {
  const editor = await openEditor(page);
  await expect(editor).toHaveAttribute("spellcheck", "true");
  expect(await editor.evaluate((node) => (node as HTMLElement).spellcheck)).toBe(true);
});

test("critère 8 : taper # , 1. , - ou **texte** ne crée aucune mise en forme", async ({ page }) => {
  const editor = await openEditor(page);
  const lines = ["# Titre", "1. un", "- tiret", "**texte**", "*texte*", "> citation", "--- trait"];
  for (const [index, line] of lines.entries()) {
    if (index > 0) {
      await page.keyboard.press("Enter");
    }
    await page.keyboard.type(line);
  }
  await expect(editor.locator("p")).toHaveText(lines);
  await expect(editor.locator("h1, h2, ol, ul, li, blockquote, hr, strong, em")).toHaveCount(0);
});

test("texte très long : dix mille caractères restent dans un seul paragraphe", async ({ page }) => {
  const editor = await openEditor(page);
  const long = "Une phrase assez longue avec des accents éàù et un emoji 😀. ".repeat(160);
  await page.keyboard.insertText(long);
  await expect(editor.locator("p")).toHaveCount(1);
  const json = await ydocJson(page);
  expect(json.content?.[0]?.content?.[0]?.text).toBe(long);
});
