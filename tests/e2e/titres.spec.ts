// Tests d'interface du ticket T1.1 (titres), dans Chromium. Raccourcis vérifiés avec un agent
// utilisateur Mac et Windows ; fichiers par la fausse implémentation de FileStore.
import { expect, test, type Page } from "@playwright/test";
import {
  MAC_USER_AGENT,
  saveAndReopen,
  start,
  topBlocks,
  waitUndoGroup,
  WINDOWS_USER_AGENT,
} from "./formatHelpers";

function styleSelect(page: Page) {
  return page.getByRole("combobox", { name: "Style du paragraphe" });
}

/** Type et niveau de chaque bloc affiché : `p`, `h1`, `h2`, `h3`. */
function blockTags(page: Page) {
  return page
    .locator(".nano-editor > *")
    .evaluateAll((nodes) => nodes.map((node) => node.tagName.toLowerCase()));
}

test("critère 1 : la liste déroulante propose Texte normal, Titre 1, Titre 2, Titre 3", async ({
  page,
}) => {
  await start(page);
  const options = await styleSelect(page)
    .locator("option:not([hidden])")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent));
  expect(options).toEqual(["Texte normal", "Titre 1", "Titre 2", "Titre 3"]);
});

test("critère 2 : choisir un niveau transforme le paragraphe du curseur", async ({ page }) => {
  const editor = await start(page);
  await page.keyboard.type("Mon exposé");
  await styleSelect(page).selectOption({ label: "Titre 2" });
  await expect(editor.locator("h2")).toHaveText("Mon exposé");
  // Le curseur reste dans l'éditeur : on peut continuer d'écrire.
  await page.keyboard.type(" !");
  await expect(editor.locator("h2")).toHaveText("Mon exposé !");
});

test("critère 2 : choisir un niveau transforme tous les paragraphes sélectionnés", async ({
  page,
}) => {
  const editor = await start(page);
  await page.keyboard.type("un");
  await page.keyboard.press("Enter");
  await page.keyboard.type("deux");
  await page.keyboard.press("Enter");
  await page.keyboard.type("trois");
  await page.keyboard.press("ControlOrMeta+a");
  await styleSelect(page).selectOption({ label: "Titre 3" });
  await expect(editor.locator("h3")).toHaveText(["un", "deux", "trois"]);
  await styleSelect(page).selectOption({ label: "Texte normal" });
  await expect(editor.locator("p")).toHaveText(["un", "deux", "trois"]);
});

test("critère 3 : la liste déroulante affiche le niveau du paragraphe du curseur, vide si la sélection en mélange", async ({
  page,
}) => {
  await start(page);
  await expect(styleSelect(page)).toHaveValue("0");
  await page.keyboard.type("Titre");
  await styleSelect(page).selectOption({ label: "Titre 1" });
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Texte");
  await expect(styleSelect(page)).toHaveValue("0");
  await page.keyboard.press("ArrowUp");
  await expect(styleSelect(page)).toHaveValue("1");
  await page.keyboard.press("ControlOrMeta+a");
  await expect(styleSelect(page)).toHaveValue("");
});

test.describe("sous Windows", () => {
  test.use({ userAgent: WINDOWS_USER_AGENT });

  test("critère 4 : Ctrl+Shift+1, 2, 3 font un titre, Ctrl+Shift+0 revient au texte normal", async ({
    page,
  }) => {
    await start(page);
    await page.keyboard.type("Ligne");
    for (const level of [1, 2, 3]) {
      await page.keyboard.press(`Control+Shift+Digit${String(level)}`);
      expect(await blockTags(page)).toEqual([`h${String(level)}`]);
    }
    await page.keyboard.press("Control+Shift+Digit0");
    expect(await blockTags(page)).toEqual(["p"]);
    // Les raccourcis Mac ne font rien sous Windows.
    await page.keyboard.press("Meta+Alt+Digit1");
    expect(await blockTags(page)).toEqual(["p"]);
  });

  test("critère 5 : AltGr+0 tape @ sans changer le niveau du paragraphe (clavier AZERTY)", async ({
    page,
  }) => {
    const editor = await start(page);
    await page.keyboard.type("Titre");
    await page.keyboard.press("Control+Shift+Digit1");
    // AltGr arrive dans le navigateur comme Ctrl+Alt, sur la touche physique 0 (puis 2 et 3).
    for (const [code, character] of [
      ["Digit0", "@"],
      ["Digit3", "#"],
      ["Digit2", "~"],
    ] as const) {
      await page.keyboard.down("Control");
      await page.keyboard.down("Alt");
      await page.keyboard.press(code);
      await page.keyboard.up("Alt");
      await page.keyboard.up("Control");
      await page.keyboard.insertText(character);
    }
    await expect(editor.locator("h1")).toHaveText("Titre@#~");
    expect(await blockTags(page)).toEqual(["h1"]);
  });
});

test.describe("sur Mac", () => {
  test.use({ userAgent: MAC_USER_AGENT });

  test("critère 4 : Cmd+Option+1, 2, 3 font un titre, Cmd+Option+0 revient au texte normal", async ({
    page,
  }) => {
    await start(page);
    await page.keyboard.type("Ligne");
    for (const level of [1, 2, 3]) {
      await page.keyboard.press(`Meta+Alt+Digit${String(level)}`);
      expect(await blockTags(page)).toEqual([`h${String(level)}`]);
    }
    await page.keyboard.press("Meta+Alt+Digit0");
    expect(await blockTags(page)).toEqual(["p"]);
    // Cmd+Shift+3 est une capture d'écran sur Mac : il ne change rien ici.
    await page.keyboard.press("Meta+Shift+Digit3");
    expect(await blockTags(page)).toEqual(["p"]);
  });
});

test("critère 6 : Entrée à la fin d'un titre crée un paragraphe de texte normal", async ({
  page,
}) => {
  const editor = await start(page);
  await page.keyboard.type("Titre");
  await styleSelect(page).selectOption({ label: "Titre 1" });
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Corps du texte");
  await expect(editor.locator("h1")).toHaveText("Titre");
  await expect(editor.locator("p")).toHaveText("Corps du texte");
  await expect(styleSelect(page)).toHaveValue("0");
});

test("critère 7 : les trois niveaux ont des tailles distinctes et décroissantes, plus grandes que le texte", async ({
  page,
}) => {
  await start(page);
  for (const [index, label] of ["Titre 1", "Titre 2", "Titre 3", "Texte normal"].entries()) {
    if (index > 0) await page.keyboard.press("Enter");
    await page.keyboard.type(label);
    await styleSelect(page).selectOption({ label });
  }
  const sizes = await page
    .locator(".nano-editor > *")
    .evaluateAll((nodes) => nodes.map((node) => parseFloat(getComputedStyle(node).fontSize)));
  expect(sizes).toHaveLength(4);
  for (let i = 1; i < sizes.length; i++) {
    expect(sizes[i - 1] ?? 0).toBeGreaterThan((sizes[i] ?? 0) * 1.1);
  }
});

test("critère 8 : le gras et l'italique restent possibles dans un titre", async ({ page }) => {
  const editor = await start(page);
  await page.keyboard.type("Un ");
  await styleSelect(page).selectOption({ label: "Titre 2" });
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type("grand");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.press("ControlOrMeta+i");
  await page.keyboard.type(" voyage");
  await expect(editor.locator("h2 strong")).toHaveText("grand");
  await expect(editor.locator("h2 em")).toHaveText(" voyage");
});

test("critère 9 : taper # en début de ligne ne crée pas de titre", async ({ page }) => {
  const editor = await start(page);
  for (const line of ["# Titre", "## Sous-titre", "### Petit titre"]) {
    await page.keyboard.type(line);
    await page.keyboard.press("Enter");
  }
  await expect(editor.locator("h1, h2, h3")).toHaveCount(0);
  await expect(editor.locator("p").first()).toHaveText("# Titre");
});

test("critère 10 : un titre garde son identifiant de bloc quand on change son niveau", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Un titre");
  await expect.poll(async () => (await topBlocks(page))[0]?.attrs?.id).toBeTruthy();
  const id = (await topBlocks(page))[0]?.attrs?.id;
  for (const label of ["Titre 1", "Titre 3", "Texte normal", "Titre 2"]) {
    await styleSelect(page).selectOption({ label });
    const [block] = await topBlocks(page);
    expect(block?.attrs?.id).toBe(id);
  }
  await page.keyboard.press("Control+Shift+Digit1");
  expect((await topBlocks(page))[0]?.attrs?.id).toBe(id);
});

test("critère 11 : les titres sont conservés après enregistrement et réouverture", async ({
  page,
}) => {
  const editor = await start(page);
  const lines = [
    ["Exposé sur les volcans", "Titre 1"],
    ["Introduction", "Titre 2"],
    ["Le Piton de la Fournaise 🌋", "Titre 3"],
    ["Un texte normal, avec des accents : éàù.", "Texte normal"],
  ] as const;
  for (const [index, [text, label]] of lines.entries()) {
    if (index > 0) await page.keyboard.press("Enter");
    await page.keyboard.type(text);
    await styleSelect(page).selectOption({ label });
  }
  const before = await topBlocks(page);
  const reopened = await saveAndReopen(page);
  expect(reopened.content).toEqual(before);
  await expect(editor.locator("h1")).toHaveText("Exposé sur les volcans");
  await expect(editor.locator("h2")).toHaveText("Introduction");
  await expect(editor.locator("h3")).toHaveText("Le Piton de la Fournaise 🌋");
});

test("critère 12 : Ctrl/Cmd+Z annule un changement de niveau en une seule fois", async ({
  page,
}) => {
  const editor = await start(page);
  await page.keyboard.type("Titre");
  await waitUndoGroup(page);
  await styleSelect(page).selectOption({ label: "Titre 1" });
  await expect(editor.locator("h1")).toHaveText("Titre");
  await waitUndoGroup(page);
  await page.keyboard.press("Control+Shift+Digit2");
  await expect(editor.locator("h2")).toHaveText("Titre");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor.locator("h1")).toHaveText("Titre");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor.locator("p")).toHaveText("Titre");
  await expect(editor.locator("h1, h2")).toHaveCount(0);
});
