// Tests d'interface du ticket T1.2 (listes à puces et numérotées), dans Chromium.
import { expect, test, type Page } from "@playwright/test";
import type { DocumentJson } from "../../src/core/types";
import {
  button,
  saveAndReopen,
  settleSelection,
  start,
  topBlocks,
  waitUndoGroup,
  ydocJson,
} from "./formatHelpers";

/** Écrit des lignes, une par élément, avec Entrée entre elles. */
async function typeLines(page: Page, lines: string[]) {
  for (const [index, line] of lines.entries()) {
    if (index > 0) await page.keyboard.press("Enter");
    await page.keyboard.type(line);
  }
}

/** Structure des listes affichées : balise et niveau de chaque élément, et son texte propre. */
function listOutline(page: Page) {
  return page.locator(".nano-editor li").evaluateAll((items) =>
    items.map((li) => {
      let level = 0;
      for (let node: Element | null = li; node; node = node.parentElement?.closest("li") ?? null) {
        level++;
      }
      return `${li.parentElement?.tagName.toLowerCase() ?? "?"}${String(level)} ${li.querySelector("p")?.textContent ?? ""}`;
    }),
  );
}

/** Identifiants de tous les éléments de liste du Y.Doc, dans l'ordre. */
function listItemIds(json: DocumentJson): unknown[] {
  const ids: unknown[] = [];
  const visit = (node: DocumentJson) => {
    if (node.type === "listItem") ids.push(node.attrs?.id);
    node.content?.forEach(visit);
  };
  visit(json);
  return ids;
}

test("critère 1 : les boutons créent une liste et s'activent quand le curseur est dans une liste du même type", async ({
  page,
}) => {
  const editor = await start(page);
  const bullets = button(page, "Liste à puces");
  const numbers = button(page, "Liste numérotée");
  await expect(bullets).toHaveAttribute("aria-pressed", "false");
  await bullets.click();
  await typeLines(page, ["pain", "lait"]);
  await expect(editor.locator("ul > li")).toHaveText(["pain", "lait"]);
  await expect(bullets).toHaveAttribute("aria-pressed", "true");
  await expect(numbers).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Les étapes");
  await expect(bullets).toHaveAttribute("aria-pressed", "false");
  await numbers.click();
  await expect(editor.locator("ol > li")).toHaveText(["Les étapes"]);
  await expect(numbers).toHaveAttribute("aria-pressed", "true");
});

test("critère 2 : Ctrl/Cmd+Shift+8 et Ctrl/Cmd+Shift+7, reconnus à la touche physique", async ({
  page,
}) => {
  const editor = await start(page);
  await page.keyboard.type("un");
  await page.keyboard.press("ControlOrMeta+Shift+Digit8");
  await expect(editor.locator("ul > li")).toHaveText(["un"]);
  await page.keyboard.press("ControlOrMeta+Shift+Digit7");
  await expect(editor.locator("ol > li")).toHaveText(["un"]);
  await expect(editor.locator("ul")).toHaveCount(0);

  // Clavier AZERTY : Maj+8 produit « 8 » au lieu de « * » ; seule la touche physique compte.
  await page.keyboard.press("ControlOrMeta+Shift+Digit7");
  await expect(editor.locator("p")).toHaveText(["un"]);
  await page.evaluate(() => {
    const target = document.querySelector(".nano-editor");
    const isMac = /Mac/.test(navigator.userAgent);
    target?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "8",
        code: "Digit8",
        shiftKey: true,
        ctrlKey: !isMac,
        metaKey: isMac,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(editor.locator("ul > li")).toHaveText(["un"]);
});

test("critère 3 : cliquer sur le bouton d'une liste active retransforme les éléments en paragraphes", async ({
  page,
}) => {
  const editor = await start(page);
  await button(page, "Liste numérotée").click();
  await typeLines(page, ["un", "deux"]);
  await page.keyboard.press("ControlOrMeta+a");
  await button(page, "Liste numérotée").click();
  await expect(editor.locator("ol, li")).toHaveCount(0);
  await expect(editor.locator("p")).toHaveText(["un", "deux"]);
});

test("critère 4 : Entrée crée un nouvel élément, Entrée sur un élément vide sort de la liste", async ({
  page,
}) => {
  const editor = await start(page);
  await button(page, "Liste à puces").click();
  await typeLines(page, ["un", "deux"]);
  await expect(editor.locator("li")).toHaveCount(2);
  await page.keyboard.press("Enter");
  await expect(editor.locator("li")).toHaveCount(3);
  await page.keyboard.press("Enter");
  await page.keyboard.type("après la liste");
  await expect(editor.locator("li")).toHaveText(["un", "deux"]);
  await expect(editor.locator(":scope > p")).toHaveText("après la liste");
});

test("critère 5 : Tab décale à droite, Shift+Tab à gauche, sur trois niveaux au maximum", async ({
  page,
}) => {
  await start(page);
  await button(page, "Liste numérotée").click();
  await typeLines(page, ["un", "deux"]);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.keyboard.type("trois");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.keyboard.type("quatre");
  // Quatrième niveau refusé : l'élément reste au niveau 3, et le curseur reste dans l'éditeur.
  await page.keyboard.press("Tab");
  expect(await listOutline(page)).toEqual(["ol1 un", "ol2 deux", "ol3 trois", "ol3 quatre"]);
  await expect(page.locator(".nano-editor")).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  expect(await listOutline(page)).toEqual(["ol1 un", "ol2 deux", "ol3 trois", "ol2 quatre"]);
  await page.keyboard.press("Shift+Tab");
  expect(await listOutline(page)).toEqual(["ol1 un", "ol2 deux", "ol3 trois", "ol1 quatre"]);
  // Au premier niveau, Shift+Tab ne retire pas la liste.
  await page.keyboard.press("Shift+Tab");
  expect(await listOutline(page)).toEqual(["ol1 un", "ol2 deux", "ol3 trois", "ol1 quatre"]);
});

test("critère 6 : la numérotation se met à jour quand on supprime ou ajoute un élément", async ({
  page,
}) => {
  const editor = await start(page);
  await button(page, "Liste numérotée").click();
  await typeLines(page, ["un", "deux", "trois", "quatre", "cinq"]);
  // La numérotation vient du navigateur (<ol>) : on lit les numéros affichés par position.
  await expect(editor.locator("ol > li")).toHaveCount(5);
  await editor.locator("li", { hasText: "deux" }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Home");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await expect(editor.locator("ol > li")).toHaveText(["un", "trois", "quatre", "cinq"]);
  // Aucun numéro écrit en dur : le navigateur numérote 1, 2, 3, 4 à partir de la position.
  await expect(editor.locator("ol[start], li[value]")).toHaveCount(0);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("deux bis");
  await expect(editor.locator("ol > li")).toHaveText(["un", "deux bis", "trois", "quatre", "cinq"]);
  await expect(editor.locator("ol[start], li[value]")).toHaveCount(0);
});

test("critère 7 : taper 1.  ou -  en début de ligne ne crée pas de liste", async ({ page }) => {
  const editor = await start(page);
  await typeLines(page, ["1. un", "- tiret", "* étoile", "2) deux"]);
  await expect(editor.locator("ul, ol, li")).toHaveCount(0);
  await expect(editor.locator("p")).toHaveText(["1. un", "- tiret", "* étoile", "2) deux"]);
});

test("critère 8 : passer de puces à numérotée et inversement conserve les éléments et leur niveau", async ({
  page,
}) => {
  await start(page);
  await button(page, "Liste à puces").click();
  await typeLines(page, ["un", "deux"]);
  await page.keyboard.press("Tab");
  await page.keyboard.press("ControlOrMeta+Home");
  await button(page, "Liste numérotée").click();
  expect(await listOutline(page)).toEqual(["ol1 un", "ul2 deux"]);
  await button(page, "Liste à puces").click();
  expect(await listOutline(page)).toEqual(["ul1 un", "ul2 deux"]);
});

test("critère 9 : chaque élément de liste a un identifiant stable, un nouvel élément en reçoit un nouveau", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("un");
  await expect.poll(async () => (await topBlocks(page))[0]?.attrs?.id).toBeTruthy();
  const paragraphId = (await topBlocks(page))[0]?.attrs?.id;
  await button(page, "Liste à puces").click();
  await typeLines(page, ["", "deux", "trois"]);
  const ids = listItemIds(await ydocJson(page));
  expect(ids).toHaveLength(3);
  for (const id of ids) expect(id).toBeTruthy();
  expect(new Set(ids).size).toBe(3);
  // Le paragraphe transformé en élément garde son propre identifiant, distinct de celui de l'élément.
  const firstItem = (await topBlocks(page))[0]?.content?.[0];
  expect(firstItem?.content?.[0]?.attrs?.id).toBe(paragraphId);

  await page.keyboard.press("Tab");
  await button(page, "Liste numérotée").click();
  expect(listItemIds(await ydocJson(page))).toEqual(ids);
});

test("critère 10 : les listes imbriquées sont conservées après enregistrement et réouverture", async ({
  page,
}) => {
  await start(page);
  await button(page, "Liste numérotée").click();
  await typeLines(page, ["Préparer la pâte", "farine 🌾"]);
  await page.keyboard.press("Tab");
  await button(page, "Liste à puces").click();
  await page.keyboard.press("Enter");
  await page.keyboard.type("œufs");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("Cuire");
  const outline = await listOutline(page);
  expect(outline).toEqual(["ol1 Préparer la pâte", "ul2 farine 🌾", "ul3 œufs", "ol1 Cuire"]);
  const before = await ydocJson(page);

  const reopened = await saveAndReopen(page);
  expect(reopened).toEqual(before);
  expect(await listOutline(page)).toEqual(outline);
});

test("critère 11 : Ctrl/Cmd+Z annule une création de liste ou un décalage en une seule fois", async ({
  page,
}) => {
  const editor = await start(page);
  await typeLines(page, ["un", "deux"]);
  await waitUndoGroup(page);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+Shift+Digit8");
  await expect(editor.locator("li")).toHaveCount(2);
  await waitUndoGroup(page);
  await page.keyboard.press("End");
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Tab");
  expect(await listOutline(page)).toEqual(["ul1 un", "ul2 deux"]);

  await page.keyboard.press("ControlOrMeta+z");
  expect(await listOutline(page)).toEqual(["ul1 un", "ul1 deux"]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor.locator("ul, li")).toHaveCount(0);
  await expect(editor.locator("p")).toHaveText(["un", "deux"]);
});

test("critère 5 : Tab refuse aussi un quatrième niveau atteint par les sous-points d'un élément", async ({
  page,
}) => {
  await start(page);
  await button(page, "Liste à puces").click();
  await typeLines(page, ["X", "A", "B"]);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.keyboard.type("C");
  await page.keyboard.press("Tab");
  expect(await listOutline(page)).toEqual(["ul1 X", "ul1 A", "ul2 B", "ul3 C"]);
  // Curseur dans A : décaler A entraînerait C au niveau 4, donc rien ne bouge.
  await page.locator(".nano-editor li p", { hasText: /^A$/ }).click();
  await settleSelection(page);
  await page.keyboard.press("Tab");
  expect(await listOutline(page)).toEqual(["ul1 X", "ul1 A", "ul2 B", "ul3 C"]);
  // Curseur dans B : B et C passent aux niveaux 3 et 4 ? Non : refusé aussi.
  await page.locator(".nano-editor li p", { hasText: /^B$/ }).click();
  await settleSelection(page);
  await page.keyboard.press("Tab");
  expect(await listOutline(page)).toEqual(["ul1 X", "ul1 A", "ul2 B", "ul3 C"]);
});
