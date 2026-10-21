// Tests d'interface du ticket T1.4 (police et taille du texte), dans Chromium.
import { expect, test, type Page } from "@playwright/test";
import { serializeDocument } from "../../src/core/fileFormat";
import { fakeFiles, setFakeFiles } from "./fakeFileStore";
import { ydocFromJson } from "../core/helpers";
import { watchNetwork } from "./networkWatch";
import {
  button,
  editor,
  saveAndReopen,
  selectText,
  settleSelection,
  start,
  waitUndoGroup,
  ydocJson,
} from "./formatHelpers";

const FONTS = ["IBM Plex Sans", "IBM Plex Serif", "IBM Plex Mono", "Source Sans 3", "EB Garamond"];

function fontSelect(page: Page) {
  return page.getByRole("combobox", { name: "Police" });
}

function sizeSelect(page: Page) {
  return page.getByRole("combobox", { name: "Taille" });
}

/** Police calculée (premier nom) et taille en pixels, arrondie au dixième, du texte `text`. */
function styleOfText(page: Page, text: string) {
  return page.evaluate((target) => {
    const root = document.querySelector(".nano-editor");
    if (!root) throw new Error("éditeur absent");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent?.includes(target) && node.parentElement) {
        const style = getComputedStyle(node.parentElement);
        return {
          font: style.fontFamily.split(",")[0]?.replace(/"/g, "").trim(),
          px: Math.round(parseFloat(style.fontSize) * 10) / 10,
        };
      }
    }
    throw new Error(`texte absent : ${target}`);
  }, text);
}

/** Taille en pixels, arrondie au dixième, d'une taille en points. */
function px(points: number): number {
  return Math.round(((points * 4) / 3) * 10) / 10;
}

test("critère 1 : la liste propose les cinq polices intégrées, chacune affichée dans sa police", async ({
  page,
}) => {
  await start(page);
  const options = fontSelect(page).locator("option:not([hidden])");
  expect(await options.evaluateAll((nodes) => nodes.map((node) => node.textContent))).toEqual(
    FONTS,
  );
  const families = await options.evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).fontFamily.split(",")[0]?.replace(/"/g, "")),
  );
  expect(families).toEqual(FONTS);
});

test("critère 2 : la liste propose les tailles de 8 à 72", async ({ page }) => {
  await start(page);
  const sizes = await sizeSelect(page)
    .locator("option:not([hidden])")
    .evaluateAll((nodes) => nodes.map((node) => Number(node.textContent)));
  expect(sizes).toEqual([8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72]);
});

test("critère 3 : police et taille s'appliquent à la sélection", async ({ page }) => {
  await start(page);
  await page.keyboard.type("Grande affiche et petit texte");
  await selectText(page, "Grande affiche");
  await fontSelect(page).selectOption("EB Garamond");
  await sizeSelect(page).selectOption("36");
  expect(await styleOfText(page, "Grande affiche")).toEqual({ font: "EB Garamond", px: 48 });
  expect(await styleOfText(page, " et petit texte")).toEqual({ font: "IBM Plex Sans", px: 16 });
});

test("critère 3 : sans sélection, police et taille s'appliquent au texte tapé ensuite", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Avant ");
  await fontSelect(page).selectOption("IBM Plex Mono");
  await sizeSelect(page).selectOption("18");
  await page.keyboard.type("après");
  expect(await styleOfText(page, "après")).toEqual({ font: "IBM Plex Mono", px: 24 });
  expect(await styleOfText(page, "Avant ")).toEqual({ font: "IBM Plex Sans", px: 16 });
  await expect(fontSelect(page)).toHaveValue("IBM Plex Mono");
  await expect(sizeSelect(page)).toHaveValue("18");
});

test("critère 4 : les listes affichent la police et la taille du curseur, vides pour une sélection mixte", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("un deux");
  await selectText(page, "deux");
  await fontSelect(page).selectOption("Source Sans 3");
  await sizeSelect(page).selectOption("24");
  await page.keyboard.press("Home");
  await settleSelection(page);
  await expect(fontSelect(page)).toHaveValue("IBM Plex Sans");
  await expect(sizeSelect(page)).toHaveValue("12");
  await page.keyboard.press("End");
  await settleSelection(page);
  await expect(fontSelect(page)).toHaveValue("Source Sans 3");
  await expect(sizeSelect(page)).toHaveValue("24");
  await page.keyboard.press("ControlOrMeta+a");
  await expect(fontSelect(page)).toHaveValue("");
  await expect(sizeSelect(page)).toHaveValue("");
});

test("critère 5 : un nouveau document utilise IBM Plex Sans en taille 12", async ({ page }) => {
  await start(page);
  await expect(fontSelect(page)).toHaveValue("IBM Plex Sans");
  await expect(sizeSelect(page)).toHaveValue("12");
  await page.keyboard.type("Bonjour");
  expect(await styleOfText(page, "Bonjour")).toEqual({ font: "IBM Plex Sans", px: 16 });
  await button(page, "Nouveau").click();
  await expect(fontSelect(page)).toHaveValue("IBM Plex Sans");
  await expect(sizeSelect(page)).toHaveValue("12");
});

test("critère 6 : police et taille sont conservées après enregistrement et réouverture", async ({
  page,
}) => {
  await start(page);
  await sizeSelect(page).selectOption("36");
  await fontSelect(page).selectOption("EB Garamond");
  await page.keyboard.type("Fête des voisins 🎉");
  await page.keyboard.press("Enter");
  await sizeSelect(page).selectOption("14");
  await fontSelect(page).selectOption("IBM Plex Serif");
  await page.keyboard.type("Samedi à 18 h, cour de l'immeuble.");
  const before = await ydocJson(page);
  const reopened = await saveAndReopen(page);
  expect(reopened).toEqual(before);
  expect(await styleOfText(page, "Fête des voisins 🎉")).toEqual({ font: "EB Garamond", px: 48 });
  expect(await styleOfText(page, "Samedi à 18 h, cour de l'immeuble.")).toEqual({
    font: "IBM Plex Serif",
    px: px(14),
  });
});

test("critère 7 : les polices sont chargées depuis l'application, sans aucune requête vers un autre domaine", async ({
  page,
  baseURL,
}) => {
  const log = watchNetwork(page);
  await start(page);
  for (const [index, font] of FONTS.entries()) {
    if (index > 0) await page.keyboard.press("Enter");
    await fontSelect(page).selectOption(font);
    await page.keyboard.type(`Texte en ${font}`);
  }
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((font) => font.status === "loaded")
      .map((font) => font.family.replace(/"/g, ""));
  });
  expect(loaded).toEqual(expect.arrayContaining(FONTS));
  const origin = new URL(baseURL ?? page.url()).origin;
  const fontFiles = log.requests.filter(({ url }) => /\.(woff2?|ttf|otf)(\?|$)/.test(url));
  expect(fontFiles.length).toBeGreaterThanOrEqual(FONTS.length);
  expect(log.requests.filter(({ url }) => new URL(url).origin !== origin)).toEqual([]);
});

test("critère 8 : une police inconnue dans un fichier s'affiche avec une police de remplacement, et son nom reste enregistré", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page);
  const text = serializeDocument({
    id: crypto.randomUUID(),
    ydoc: ydocFromJson({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "p-1" },
          content: [
            {
              type: "text",
              text: "Venu du futur",
              marks: [
                { type: "textStyle", attrs: { fontFamily: "Futura Nova 2030", fontSize: "20pt" } },
              ],
            },
          ],
        },
      ],
    }),
  });
  await setFakeFiles(page, { files: { "futur.nano": text }, nextOpen: "futur.nano" });
  await button(page, "Ouvrir…").click();
  await expect(editor(page)).toHaveText("Venu du futur");
  expect(await styleOfText(page, "Venu du futur")).toEqual({
    font: "IBM Plex Sans",
    px: px(20),
  });
  await expect(fontSelect(page)).toHaveValue("");

  // Une modification ailleurs, puis Enregistrer : le nom d'origine est réécrit tel quel.
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Ajout");
  await setFakeFiles(page, { nextSaveName: "futur.nano" });
  await button(page, "Enregistrer").click();
  await expect.poll(async () => (await fakeFiles(page)).files["futur.nano"]).toContain("Ajout");
  expect((await fakeFiles(page)).files["futur.nano"]).toContain("Futura Nova 2030");
  expect(errors).toEqual([]);
});

test("critère 9 : Ctrl/Cmd+Z annule un changement de police ou de taille en une seule fois", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Texte");
  await waitUndoGroup(page);
  await page.keyboard.press("ControlOrMeta+a");
  await fontSelect(page).selectOption("EB Garamond");
  await waitUndoGroup(page);
  await sizeSelect(page).selectOption("28");
  expect(await styleOfText(page, "Texte")).toEqual({ font: "EB Garamond", px: px(28) });
  await page.keyboard.press("ControlOrMeta+z");
  expect(await styleOfText(page, "Texte")).toEqual({ font: "EB Garamond", px: 16 });
  await page.keyboard.press("ControlOrMeta+z");
  expect(await styleOfText(page, "Texte")).toEqual({ font: "IBM Plex Sans", px: 16 });
});

test("dans un titre sans taille choisie, la taille reste vide ; choisir 12 l'écrit vraiment", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Titre");
  await page
    .getByRole("combobox", { name: "Style du paragraphe" })
    .selectOption({ label: "Titre 1" });
  await expect(sizeSelect(page)).toHaveValue("");
  await page.keyboard.press("ControlOrMeta+a");
  await sizeSelect(page).selectOption("12");
  expect(await styleOfText(page, "Titre")).toEqual({ font: "IBM Plex Sans", px: 16 });
});

test("critère 3 : Entrée garde la police et la taille choisies pour le texte tapé ensuite", async ({
  page,
}) => {
  await start(page);
  await fontSelect(page).selectOption("EB Garamond");
  await sizeSelect(page).selectOption("20");
  await page.keyboard.type("Un");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Deux");
  expect(await styleOfText(page, "Deux")).toEqual({ font: "EB Garamond", px: px(20) });
  await expect(fontSelect(page)).toHaveValue("EB Garamond");
  await expect(sizeSelect(page)).toHaveValue("20");
});
