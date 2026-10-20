// Tests d'interface du ticket T1.3 (alignement du texte), dans Chromium.
// Les raccourcis du navigateur (console, téléchargements, rechargement) ne peuvent pas être prouvés
// ici : Playwright envoie les touches à la page, pas à Chrome. Seule la vérification manuelle le confirme.
import { expect, test, type Page } from "@playwright/test";
import {
  button,
  saveAndReopen,
  settleSelection,
  start,
  topBlocks,
  waitUndoGroup,
} from "./formatHelpers";

const LABELS = ["Aligner à gauche", "Centrer", "Aligner à droite", "Justifier"];

/** Alignement calculé de chaque bloc de premier niveau. */
function alignments(page: Page) {
  return page
    .locator(".nano-editor > *")
    .evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).textAlign.replace(/^start$/, "left")),
    );
}

/** Noms des boutons d'alignement activés. */
async function pressed(page: Page) {
  const result: string[] = [];
  for (const label of LABELS) {
    if ((await button(page, label).getAttribute("aria-pressed")) === "true") result.push(label);
  }
  return result;
}

test("critère 1 : quatre boutons, celui du paragraphe courant est activé", async ({ page }) => {
  await start(page);
  await page.keyboard.type("Texte");
  expect(await pressed(page)).toEqual(["Aligner à gauche"]);
  for (const [label, css] of [
    ["Centrer", "center"],
    ["Aligner à droite", "right"],
    ["Justifier", "justify"],
    ["Aligner à gauche", "left"],
  ] as const) {
    await button(page, label).click();
    expect(await alignments(page)).toEqual([css]);
    expect(await pressed(page)).toEqual([label]);
  }
});

test("critère 2 : Ctrl/Cmd+Shift+L, E, R, J, reconnus à la touche physique et consommés par l'éditeur", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Texte");
  for (const [key, css] of [
    ["KeyE", "center"],
    ["KeyR", "right"],
    ["KeyJ", "justify"],
    ["KeyL", "left"],
  ] as const) {
    await page.keyboard.press(`ControlOrMeta+Shift+${key}`);
    expect(await alignments(page)).toEqual([css]);
  }
  // Le raccourci est consommé (preventDefault) : le navigateur ne le reçoit pas.
  const prevented = await page.evaluate(() => {
    const target = document.querySelector(".nano-editor");
    const isMac = /Mac/.test(navigator.userAgent);
    return ["KeyJ", "KeyR"].map((code) => {
      const event = new KeyboardEvent("keydown", {
        key: code.slice(3),
        code,
        shiftKey: true,
        ctrlKey: !isMac,
        metaKey: isMac,
        bubbles: true,
        cancelable: true,
      });
      target?.dispatchEvent(event);
      return event.defaultPrevented;
    });
  });
  expect(prevented).toEqual([true, true]);
});

test("critère 3 : l'alignement s'applique à tous les paragraphes sélectionnés", async ({
  page,
}) => {
  await start(page);
  for (const [index, line] of ["un", "deux", "trois"].entries()) {
    if (index > 0) await page.keyboard.press("Enter");
    await page.keyboard.type(line);
  }
  await page.keyboard.press("ControlOrMeta+a");
  await button(page, "Centrer").click();
  expect(await alignments(page)).toEqual(["center", "center", "center"]);
  await settleSelection(page);
  // Sélection de deux paragraphes seulement : le premier ne change pas.
  const paragraphs = page.locator(".nano-editor p");
  await paragraphs.nth(1).click();
  await settleSelection(page);
  await paragraphs.nth(2).click({ modifiers: ["Shift"] });
  await settleSelection(page);
  await page.keyboard.press("ControlOrMeta+Shift+KeyR");
  expect(await alignments(page)).toEqual(["center", "right", "right"]);
  // Une sélection qui mélange deux alignements n'active aucun bouton.
  await page.keyboard.press("ControlOrMeta+a");
  expect(await pressed(page)).toEqual([]);
});

test("critère 4 : l'alignement fonctionne sur les paragraphes et les titres", async ({ page }) => {
  const editor = await start(page);
  await page.keyboard.type("Invitation");
  await page
    .getByRole("combobox", { name: "Style du paragraphe" })
    .selectOption({ label: "Titre 1" });
  await button(page, "Centrer").click();
  await expect(editor.locator("h1")).toHaveCSS("text-align", "center");
  // Changer le niveau garde l'alignement.
  await page.keyboard.press("Control+Shift+Digit2");
  await expect(editor.locator("h2")).toHaveCSS("text-align", "center");
});

test("critère 5 : un nouveau paragraphe créé avec Entrée reprend l'alignement du précédent", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Adresse");
  await button(page, "Aligner à droite").click();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Ville");
  expect(await alignments(page)).toEqual(["right", "right"]);
  expect(await pressed(page)).toEqual(["Aligner à droite"]);
  // Aussi après un titre : le paragraphe de texte normal créé par Entrée garde l'alignement.
  await page.keyboard.press("Enter");
  await page.keyboard.type("Titre");
  await page.keyboard.press("Control+Shift+Digit1");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Texte");
  expect(await alignments(page)).toEqual(["right", "right", "right", "right"]);
});

test("critère 6 : l'alignement par défaut est à gauche", async ({ page }) => {
  await start(page);
  await page.keyboard.type("Texte");
  expect(await alignments(page)).toEqual(["left"]);
  expect(await pressed(page)).toEqual(["Aligner à gauche"]);
  expect((await topBlocks(page))[0]?.attrs?.textAlign ?? null).toBeNull();
});

test("critère 7 : l'alignement est conservé après enregistrement et réouverture", async ({
  page,
}) => {
  await start(page);
  for (const [index, [line, key]] of [
    ["Mme Dupont", "KeyR"],
    ["Invitation", "KeyE"],
    ["Un corps de lettre justifié, avec des accents éàù 😀.", "KeyJ"],
    ["Bises", "KeyL"],
  ].entries()) {
    if (index > 0) await page.keyboard.press("Enter");
    await page.keyboard.type(line ?? "");
    await page.keyboard.press(`ControlOrMeta+Shift+${key ?? ""}`);
  }
  const before = await topBlocks(page);
  const reopened = await saveAndReopen(page);
  expect(reopened.content).toEqual(before);
  expect(await alignments(page)).toEqual(["right", "center", "justify", "left"]);
});

test("critère 8 : Ctrl/Cmd+Z annule un changement d'alignement en une seule fois", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Texte");
  await waitUndoGroup(page);
  await page.keyboard.press("ControlOrMeta+Shift+KeyE");
  await waitUndoGroup(page);
  await button(page, "Justifier").click();
  expect(await alignments(page)).toEqual(["justify"]);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await alignments(page)).toEqual(["center"]);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await alignments(page)).toEqual(["left"]);
  await expect(page.locator(".nano-editor p")).toHaveText("Texte");
});
