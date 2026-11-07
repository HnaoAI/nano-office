// Tests d'interface du ticket P1 (Entrée rapide dans un long document), dans Chromium : délai d'Entrée, de Retour
// arrière, de Suppr et de Ctrl/Cmd+Entrée en haut d'un document de 100 pages, calcul des feuilles, identifiants de
// bloc gardés après enregistrement et réouverture, annulation en une étape, compteur de pages et plan qui suivent.
import { expect, test, type Page } from "@playwright/test";
import type { DocumentJson } from "../../src/core/types";
import { fakeFiles, setFakeFiles } from "./fakeFileStore";
import {
  button,
  editor,
  settleSelection,
  start,
  topBlocks,
  waitUndoGroup,
  ydocJson,
} from "./formatHelpers";
import { openDocument, pages, settleLayout } from "./pageHelpers";

/** Essais par touche (critère 2 : médiane sur 20 essais). */
const TRIES = 20;

/**
 * Lettres des paragraphes courts en haut du document, à joindre par Retour arrière ou Suppr (critère 3). Une lettre
 * chacun : une fois joints, ils tiennent sur une ligne, et Début et Fin vont au bout du paragraphe.
 */
const LETTERS = [..."éabcdefghijklmnopqrst"];

function shortLines(): DocumentJson[] {
  return LETTERS.map((letter, index) => ({
    type: "paragraph",
    attrs: { id: `court-${String(index)}` },
    content: [{ type: "text", text: letter }],
  }));
}

/** Nombre de pages du compteur « Page 3 sur 7 ». */
async function counted(page: Page): Promise<number> {
  const text = (await page.locator(".nano-page-counter").textContent()) ?? "";
  return Number(/sur (\d+)/.exec(text)?.[1] ?? 0);
}

/** Enregistre le document ouvert depuis « expose.nano », crée un document vide, puis rouvre le fichier. */
async function saveAndReopenExpose(page: Page): Promise<DocumentJson> {
  const previous = (await fakeFiles(page)).files["expose.nano"];
  await button(page, "Enregistrer").click();
  await expect
    .poll(async () => (await fakeFiles(page)).files["expose.nano"] !== previous)
    .toBe(true);
  await expect(page.locator(".nano-save-state-saved")).toBeVisible();
  await button(page, "Nouveau").click();
  await expect(editor(page)).toHaveText("");
  await setFakeFiles(page, { nextOpen: "expose.nano" });
  await button(page, "Ouvrir…").click();
  await expect(editor(page)).not.toHaveText("");
  return ydocJson(page);
}

/** Ouvre un long document, attend ses 100 pages et place le curseur tout en haut. */
async function openLong(page: Page, content: DocumentJson[]) {
  await start(page);
  await openDocument(page, content);
  await expect.poll(() => counted(page)).toBeGreaterThanOrEqual(100);
  await settleLayout(page);
  await editor(page).press("ControlOrMeta+Home");
  await settleSelection(page);
}

/**
 * Prépare la mesure, dans la page, du délai de la touche `key` : du keydown (avant l'éditeur) à la deuxième image
 * affichée ensuite, comme le test du critère 8 de PL6. Efface les mesures précédentes du calcul des feuilles.
 */
async function watchKey(page: Page, key: string) {
  await page.evaluate((watched) => {
    const delays: number[] = [];
    (window as unknown as { keyDelays: number[] }).keyDelays = delays;
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== watched) return;
        const pressed = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => delays.push(performance.now() - pressed)),
        );
      },
      true,
    );
    performance.clearMeasures("nano-page-layout");
  }, key);
}

/** Délais mesurés par `watchKey`, et durées des calculs des feuilles faits depuis. */
async function readDelays(page: Page): Promise<{ delays: number[]; layouts: number[] }> {
  return page.evaluate(() => ({
    delays: (window as unknown as { keyDelays: number[] }).keyDelays,
    layouts: performance.getEntriesByName("nano-page-layout").map((entry) => entry.duration),
  }));
}

/** Appuie sur `press` et attend que son délai soit mesuré, pour que chaque essai parte d'un éditeur au repos. */
async function measuredPress(page: Page, press: string, done: number) {
  await page.keyboard.press(press);
  await expect
    .poll(async () => (await readDelays(page)).delays.length, { timeout: 10_000 })
    .toBe(done);
  await settleLayout(page);
}

function median(values: number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** Vérifie les délais d'une touche (critères 2 et 3) et les écrit dans le rapport, pour la PR (critère 1). */
async function expectFast(page: Page, label: string) {
  const { delays, layouts } = await readDelays(page);
  expect(delays).toHaveLength(TRIES);
  const summary = `${label} : médiane ${median(delays).toFixed(0)} ms, maximum ${Math.max(...delays).toFixed(0)} ms ; feuilles : médiane ${median(layouts).toFixed(1)} ms, maximum ${Math.max(...layouts).toFixed(1)} ms`;
  test.info().annotations.push({ type: "mesure", description: summary });
  console.log(summary);
  expect(median(delays)).toBeLessThan(100);
  expect(Math.max(...delays)).toBeLessThan(250);
  return layouts;
}

test.describe("P1 : Entrée rapide dans un long document", () => {
  test.setTimeout(180_000);

  test("critères 2 et 8 : sur 100 pages, curseur en haut, Entrée bloque l'éditeur moins de 100 ms et le calcul des feuilles reste sous 30 ms", async ({
    page,
  }) => {
    await openLong(page, pages(100));
    const before = await counted(page);
    await watchKey(page, "Enter");
    for (let index = 1; index <= TRIES; index++) await measuredPress(page, "Enter", index);
    const layouts = await expectFast(page, "Entrée");
    expect(median(layouts)).toBeLessThan(30);
    // Les feuilles et le compteur suivent toujours (critère 5) : 20 lignes vides de plus en haut.
    await expect.poll(() => counted(page)).toBeGreaterThan(before);
    await expect
      .poll(async () => (await page.locator(".nano-sheet").count()) === (await counted(page)))
      .toBe(true);
  });

  test("critère 3 : Retour arrière au début d'un paragraphe, qui le joint au précédent, bloque l'éditeur moins de 100 ms", async ({
    page,
  }) => {
    await openLong(page, [...shortLines(), ...pages(100)]);
    await watchKey(page, "Backspace");
    for (let index = 1; index <= TRIES; index++) {
      await page.keyboard.press("ArrowDown");
      await settleSelection(page);
      await page.keyboard.press("Home");
      await settleSelection(page);
      await measuredPress(page, "Backspace", index);
    }
    await expectFast(page, "Retour arrière");
    const first = (await topBlocks(page))[0];
    expect(first?.attrs?.id).toBe("court-0");
    expect(first?.content?.[0]?.text).toBe(LETTERS.join(""));
  });

  test("critère 3 : Suppr à la fin d'un paragraphe, qui lui joint le suivant, bloque l'éditeur moins de 100 ms", async ({
    page,
  }) => {
    await openLong(page, [...shortLines(), ...pages(100)]);
    await watchKey(page, "Delete");
    for (let index = 1; index <= TRIES; index++) {
      await page.keyboard.press("End");
      await settleSelection(page);
      await measuredPress(page, "Delete", index);
    }
    await expectFast(page, "Suppr");
    const first = (await topBlocks(page))[0];
    expect(first?.attrs?.id).toBe("court-0");
    expect(first?.content?.[0]?.text).toBe(LETTERS.join(""));
  });

  test("critère 3 : Ctrl/Cmd+Entrée (saut de page) en haut de 100 pages bloque l'éditeur moins de 100 ms", async ({
    page,
  }) => {
    await openLong(page, pages(100));
    const before = await counted(page);
    await watchKey(page, "Enter");
    for (let index = 1; index <= TRIES; index++) {
      await measuredPress(page, "ControlOrMeta+Enter", index);
    }
    await expectFast(page, "Ctrl/Cmd+Entrée");
    const breaks = (await topBlocks(page)).filter((block) => block.type === "pageBreak");
    expect(breaks).toHaveLength(TRIES);
    // Chaque saut de page ajoute une page (critère 5 : le compteur suit).
    await expect.poll(() => counted(page)).toBe(before + TRIES);
  });

  test("critères 4 et 5 : après des Entrée, chaque bloc garde un identifiant unique et stable, gardé à la réouverture, et Ctrl/Cmd+Z défait une Entrée à la fois", async ({
    page,
  }) => {
    const content = [
      {
        type: "heading",
        attrs: { id: "titre", level: 1 },
        content: [{ type: "text", text: "Été 🌾" }],
      },
      ...pages(100),
    ];
    await openLong(page, content);
    const original = (await topBlocks(page)).map((block) => block.attrs?.id);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await settleSelection(page);
    for (let index = 0; index < 3; index++) {
      await page.keyboard.press("Enter");
      await waitUndoGroup(page);
    }
    const after = await topBlocks(page);
    const ids = after.map((block) => block.attrs?.id);
    expect(ids).toHaveLength(original.length + 3);
    for (const id of ids) expect(id).toBeTruthy();
    expect(new Set(ids).size).toBe(ids.length);
    // Les blocs d'origine gardent leur identifiant, dans le même ordre ; seuls les 3 nouveaux en ont un neuf.
    expect(ids.filter((id) => original.includes(id))).toEqual(original);
    expect(after.slice(1, 4).map((block) => block.content?.length ?? 0)).toEqual([0, 0, 0]);
    // Le plan suit : le titre est toujours là, au-dessus des lignes vides.
    await button(page, "Plan").click();
    await expect(page.locator(".nano-outline .nano-outline-item").first()).toHaveText(/Été 🌾/);
    await button(page, "Plan").click();

    // Une annulation défait une seule Entrée.
    await editor(page).press("ControlOrMeta+z");
    await expect.poll(async () => (await topBlocks(page)).length).toBe(original.length + 2);
    await editor(page).press("ControlOrMeta+z");
    await expect.poll(async () => (await topBlocks(page)).length).toBe(original.length + 1);
    await editor(page).press("ControlOrMeta+Shift+z");
    await expect.poll(async () => (await topBlocks(page)).length).toBe(original.length + 2);
    const kept = (await topBlocks(page)).map((block) => block.attrs?.id);
    expect(new Set(kept).size).toBe(kept.length);

    // Les identifiants survivent à l'enregistrement et à la réouverture.
    const reopened = await saveAndReopenExpose(page);
    expect((reopened.content ?? []).map((block) => block.attrs?.id)).toEqual(kept);
  });
});
