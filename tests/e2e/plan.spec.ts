// Tests d'interface du ticket T2.9 (plan du document), dans Chromium : ouvrir et fermer le plan, choix
// retenu, petite largeur, titres et numéros de page, clic pour aller à un titre, titre actif, glisser une
// partie avec tableau et image puis un Ctrl/Cmd+Z, déplacement au clavier, réouverture du fichier,
// sauvegarde automatique, 200 titres, rien d'imprimé ni d'enregistré.
import { expect, test, type Page } from "@playwright/test";
import { serializeDocument } from "../../src/core/fileFormat";
import type { DocumentJson } from "../../src/core/types";
import { ydocFromJson } from "../core/helpers";
import { fakeFiles, setFakeFiles } from "./fakeFileStore";
import {
  button,
  editor,
  settleSelection,
  start,
  topBlocks,
  waitEditorFocus,
  waitUndoGroup,
  ydocJson,
} from "./formatHelpers";
import { expectImagesLoaded, insertWithButton, makeImage } from "./imageHelpers";

const SENTENCE = "Le vent d'été pousse les cerfs-volants de Zoé au-dessus des champs 🌾. ";

function text(value: string): DocumentJson {
  return { type: "text", text: value };
}

function para(id: string, sentences = 2): DocumentJson {
  return { type: "paragraph", attrs: { id }, content: [text(SENTENCE.repeat(sentences).trim())] };
}

function heading(id: string, level: number, value: string): DocumentJson {
  return { type: "heading", attrs: { id, level }, content: [text(value)] };
}

function table(id: string): DocumentJson {
  return {
    type: "table",
    content: [0, 1].map((row) => ({
      type: "tableRow",
      content: [0, 1].map((col) => ({
        type: row === 0 ? "tableHeader" : "tableCell",
        attrs: { id: `${id}-c-${row}-${col}` },
        content: [
          {
            type: "paragraph",
            attrs: { id: `${id}-p-${row}-${col}` },
            content: [text(`Case ${row}-${col}`)],
          },
        ],
      })),
    })),
  };
}

const PAGE_BREAK = (id: string): DocumentJson => ({ type: "pageBreak", attrs: { id } });

/** Exposé de trois parties de Titre 1 ; la deuxième a deux sous-parties, la troisième un tableau. */
const EXPOSE: DocumentJson[] = [
  heading("h-a", 1, "Le vent"),
  ...Array.from({ length: 8 }, (_, index) => para(`a-${index}`, 4)),
  heading("h-b", 1, "Les cerfs-volants"),
  para("b-0"),
  heading("h-b1", 2, "Histoire"),
  para("b1-0"),
  heading("h-b2", 3, "En Chine"),
  para("b2-0"),
  PAGE_BREAK("pb"),
  para("b2-1"),
  heading("h-c", 1, "Conclusion"),
  para("c-0"),
  table("t"),
  ...Array.from({ length: 8 }, (_, index) => para(`c-${index + 1}`, 4)),
];

async function openDocument(page: Page, content: DocumentJson[]) {
  const ydoc = ydocFromJson({ type: "doc", content });
  const file = serializeDocument({ id: crypto.randomUUID(), ydoc });
  await setFakeFiles(page, { files: { "expose.nano": file }, nextOpen: "expose.nano" });
  await button(page, "Ouvrir…").click();
  await expect(page.getByRole("banner").getByText("expose", { exact: true })).toBeVisible();
  await waitEditorFocus(page);
}

function planButton(page: Page) {
  return page.getByRole("toolbar", { name: "Mise en forme" }).getByRole("button", { name: "Plan" });
}

function panel(page: Page) {
  return page.getByRole("complementary", { name: "Plan" });
}

function item(page: Page, name: string) {
  return panel(page).getByRole("button", { name: new RegExp(`^${name}`) });
}

async function openPlan(page: Page) {
  await planButton(page).click();
  await expect(panel(page)).toBeVisible();
}

/** Identifiants des blocs de premier niveau du Y.Doc, ou leur type (tableau, image sans identifiant). */
async function topIds(page: Page): Promise<string[]> {
  return (await topBlocks(page)).map((node) => (node.attrs?.id as string | undefined) ?? node.type);
}

/** Tous les identifiants de blocs du Y.Doc, triés. */
async function allIds(page: Page): Promise<string[]> {
  const ids: string[] = [];
  const walk = (node: DocumentJson) => {
    if (typeof node.attrs?.id === "string") ids.push(node.attrs.id);
    node.content?.forEach(walk);
  };
  walk(await ydocJson(page));
  return ids.sort();
}

/** Fait glisser une ligne du plan dans la moitié haute d'une autre, en vérifiant le trait de dépôt. */
async function dragBefore(page: Page, source: string, target: string) {
  const from = await item(page, source).boundingBox();
  const to = await item(page, target).boundingBox();
  if (!from || !to) throw new Error("ligne du plan invisible");
  await page.mouse.move(from.x + 20, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 20, to.y + 4, { steps: 8 });
  // Un dernier mouvement, pour que le navigateur envoie le survol à la position finale.
  await page.mouse.move(to.x + 22, to.y + 5);
  // Un trait noir montre où la partie sera posée (critère 4).
  const line = panel(page).locator(".nano-outline-drop");
  await expect(line).toHaveCount(1);
  await expect(line.getByRole("button")).toHaveText(new RegExp(`^${target}`));
  const color = await line.evaluate(
    (element) => getComputedStyle(element, "::before").backgroundColor,
  );
  expect(color).toBe("rgb(18, 18, 18)");
  await page.mouse.up();
}

test.describe("T2.9 : plan du document", () => {
  test("critère 1 : « Plan » ouvre et ferme le panneau, fermé par défaut, et le choix est retenu", async ({
    page,
  }) => {
    await start(page);
    await page.keyboard.type("Bonjour");
    await expect(planButton(page)).toHaveAttribute("aria-pressed", "false");
    await expect(panel(page)).toHaveCount(0);
    await openPlan(page);
    await expect(planButton(page)).toHaveAttribute("aria-pressed", "true");
    // Le panneau est à gauche de la page, sans la recouvrir sur un écran large.
    const box = await panel(page).boundingBox();
    const sheet = await page.locator(".nano-page").boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(sheet?.x ?? 0);
    // Le focus reste dans le document : on continue d'écrire.
    await page.keyboard.type(" Zoé");
    await expect(editor(page)).toHaveText("Bonjour Zoé");

    await page.reload();
    await expect(panel(page)).toBeVisible();
    await planButton(page).click();
    await expect(panel(page)).toHaveCount(0);
    await page.reload();
    await expect(editor(page)).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
  });

  test("critère 1 : à petite largeur, le panneau passe par-dessus la page et se ferme après un clic", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await start(page);
    await openDocument(page, EXPOSE);
    await openPlan(page);
    const box = await panel(page).boundingBox();
    const sheet = await page.locator(".nano-page").boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeGreaterThan(sheet?.x ?? 0);
    await item(page, "Conclusion").click();
    await expect(panel(page)).toHaveCount(0);
    await expect(editor(page)).toBeFocused();
  });

  test("critère 2 : titres en retrait selon leur niveau, numéros de page et saut de page", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, EXPOSE);
    await openPlan(page);
    const lines = panel(page).locator(".nano-outline-item");
    await expect(lines).toHaveText([
      /^Le vent1$/,
      /^Les cerfs-volants\d$/,
      /^Histoire\d$/,
      /^En Chine\d$/,
      /^Saut de page\d$/,
      /^Conclusion\d$/,
    ]);
    // Retrait de 12 px par niveau, numéros en IBM Plex Mono 12 px.
    const left = async (name: string) => (await item(page, name).boundingBox())?.x ?? 0;
    expect((await left("Histoire")) - (await left("Les cerfs-volants"))).toBeCloseTo(12, 0);
    expect((await left("En Chine")) - (await left("Histoire"))).toBeCloseTo(12, 0);
    const number = item(page, "Conclusion").locator(".nano-outline-page");
    await expect(number).toHaveCSS("font-size", "12px");
    await expect(number).toHaveCSS("font-family", /IBM Plex Mono/);
    // Le saut de page fait commencer la conclusion sur une nouvelle page, comme dans le pied de page.
    const pageOf = async (name: string) =>
      Number(await item(page, name).locator(".nano-outline-page").textContent());
    expect(await pageOf("Le vent")).toBe(1);
    expect(await pageOf("Conclusion")).toBeGreaterThan(await pageOf("En Chine"));
    // Même numéro que les repères de page de T2.8 : un de plus que le nombre de repères au-dessus du titre.
    const marks = await page
      .locator(".nano-page-mark")
      .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
    expect(marks.length).toBeGreaterThan(0);
    for (const name of ["Le vent", "Histoire", "Conclusion"]) {
      const top = (await editor(page).getByRole("heading", { name }).boundingBox())?.y ?? 0;
      expect(await pageOf(name), name).toBe(1 + marks.filter((y) => y < top).length);
    }
  });

  test("critère 2 : sans titre, le panneau explique en une phrase comment en créer", async ({
    page,
  }) => {
    await start(page);
    await page.keyboard.type("Une liste de courses, sans titre.");
    await openPlan(page);
    await expect(panel(page).getByText(/Aucun titre pour l'instant/)).toBeVisible();
    // Le plan se remplit dès qu'un titre apparaît.
    await page.keyboard.press("Home");
    await page.getByRole("combobox", { name: "Style du paragraphe" }).selectOption("1");
    await expect(item(page, "Une liste de courses")).toBeVisible();
  });

  test("critère 3 : un clic amène le curseur au début du titre, sous la barre figée, et le titre actif est mis en évidence", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await start(page);
    await openDocument(page, EXPOSE);
    await openPlan(page);
    await expect(item(page, "Le vent")).toHaveAttribute("aria-current", "location");
    await item(page, "Conclusion").click();
    await expect(editor(page)).toBeFocused();
    await settleSelection(page);
    await page.keyboard.type("» ");
    await expect(editor(page).locator("h1").last()).toHaveText("» Conclusion");
    // Le titre est en haut de la fenêtre, juste sous la partie figée, jamais dessous.
    const top = await page.locator(".nano-top").boundingBox();
    const title = await editor(page).locator("h1").last().boundingBox();
    const below = (title?.y ?? 0) - ((top?.y ?? 0) + (top?.height ?? 0));
    expect(below).toBeGreaterThanOrEqual(0);
    expect(below).toBeLessThan(60);
    await expect(item(page, "» Conclusion")).toHaveAttribute("aria-current", "location");
    await expect(item(page, "Le vent")).not.toHaveAttribute("aria-current");
    await expect(item(page, "» Conclusion")).toHaveCSS("background-color", "rgb(243, 243, 241)");
    // Le curseur dans une sous-partie met en évidence son sous-titre.
    await editor(page).getByText("En Chine").click();
    await expect(item(page, "En Chine")).toHaveAttribute("aria-current", "location");
  });

  test("critères 4 à 6 : glisser une partie avec tableau et image, puis un Ctrl/Cmd+Z remet tout en place", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, EXPOSE);
    // Une image à la fin de la conclusion, la dernière partie.
    await page.keyboard.press("ControlOrMeta+End");
    await insertWithButton(page, [
      await makeImage(page, "photo.png", { width: 400, height: 300, type: "image/png" }),
    ]);
    await expectImagesLoaded(page, 1);
    await waitUndoGroup(page);
    const ids = await allIds(page);
    const before = await ydocJson(page);
    const order = await topIds(page);
    await openPlan(page);

    await dragBefore(page, "Conclusion", "Le vent");
    await expect(panel(page).locator(".nano-outline-item")).toHaveText([
      /^Conclusion/,
      /^Le vent/,
      /^Les cerfs-volants/,
      /^Histoire/,
      /^En Chine/,
      /^Saut de page/,
    ]);
    const moved = await topIds(page);
    const conclusion = order.slice(order.indexOf("h-c"));
    expect(moved.slice(0, conclusion.length)).toEqual(conclusion);
    expect(moved).toContain("table");
    expect(moved.filter((id) => id === "table")).toHaveLength(1);
    // Rien n'est dupliqué ni perdu : mêmes identifiants, image comprise (critère 6).
    expect(await allIds(page)).toEqual(ids);
    await expectImagesLoaded(page, 1);
    await expect(editor(page).locator("h1").first()).toHaveText("Conclusion");
    // Un déplacement est une modification (critère 5).
    await expect(page.getByRole("banner").locator(".nano-save-state")).not.toHaveText("Enregistré");

    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => ydocJson(page)).toEqual(before);
    await expectImagesLoaded(page, 1);
    await expect(item(page, "Le vent")).toBeVisible();
  });

  test("critère 4 : poser une partie dans elle-même ne montre aucun trait et ne change rien", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, EXPOSE);
    const before = await ydocJson(page);
    await openPlan(page);
    await item(page, "Les cerfs-volants").dragTo(item(page, "En Chine"), {
      targetPosition: { x: 20, y: 4 },
    });
    await expect(panel(page).locator(".nano-outline-drop")).toHaveCount(0);
    expect(await ydocJson(page)).toEqual(before);
  });

  test("critère 4 : au clavier, Alt+Shift+Flèche fait passer la partie avant la précédente ou après la suivante", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, EXPOSE);
    await openPlan(page);
    await item(page, "Conclusion").focus();
    await page.keyboard.press("Alt+Shift+ArrowUp");
    await expect(panel(page).locator(".nano-outline-item")).toHaveText([
      /^Le vent/,
      /^Conclusion/,
      /^Les cerfs-volants/,
      /^Histoire/,
      /^En Chine/,
      /^Saut de page/,
    ]);
    // Le titre déplacé garde le focus : on peut continuer.
    await expect(item(page, "Conclusion")).toBeFocused();
    await page.keyboard.press("Alt+Shift+ArrowUp");
    expect((await topIds(page))[0]).toBe("h-c");
    // Première partie : rien ne bouge.
    await page.keyboard.press("Alt+Shift+ArrowUp");
    expect((await topIds(page))[0]).toBe("h-c");
    await page.keyboard.press("Alt+Shift+ArrowDown");
    expect((await topIds(page)).slice(0, 2)).toEqual(["h-a", "a-0"]);
    // Ctrl/Cmd+Z depuis le plan annule le dernier déplacement, en une fois (critère 5).
    await page.keyboard.press("ControlOrMeta+z");
    expect((await topIds(page))[0]).toBe("h-c");
    await page.keyboard.press("ControlOrMeta+Shift+z");
    expect((await topIds(page))[0]).toBe("h-a");
    await item(page, "Conclusion").focus();
    // Les flèches seules passent d'un titre à l'autre.
    await page.keyboard.press("ArrowDown");
    await expect(item(page, "Les cerfs-volants")).toBeFocused();
    // Un sous-titre ne quitte pas sa partie : En Chine est seul de son niveau.
    await item(page, "En Chine").focus();
    const before = await topIds(page);
    await page.keyboard.press("Alt+Shift+ArrowUp");
    expect(await topIds(page)).toEqual(before);
  });

  test("critère 4 : dans le document, Alt+Shift+Flèche sur un titre déplace sa partie, une annulation par déplacement", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, EXPOSE);
    await openPlan(page);
    await editor(page).getByText("Conclusion").click();
    await settleSelection(page);
    await page.keyboard.press("Alt+Shift+ArrowUp");
    await page.keyboard.press("Alt+Shift+ArrowUp");
    expect((await topIds(page))[0]).toBe("h-c");
    await expect(editor(page)).toBeFocused();
    // Chaque déplacement s'annule à part.
    await page.keyboard.press("ControlOrMeta+z");
    const ids = await topIds(page);
    expect(ids[0]).toBe("h-a");
    expect(ids.indexOf("h-c")).toBeLessThan(ids.indexOf("h-b"));
    // Hors d'un titre, Alt+Shift+Flèche garde son rôle habituel.
    await editor(page).getByText(SENTENCE.trim().slice(0, 20)).first().click();
    await settleSelection(page);
    const before = await topIds(page);
    await page.keyboard.press("Alt+Shift+ArrowUp");
    expect(await topIds(page)).toEqual(before);
  });

  test("réouverture du fichier après un déplacement : ordre et identifiants gardés", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, EXPOSE);
    await openPlan(page);
    await dragBefore(page, "Conclusion", "Les cerfs-volants");
    const ids = await allIds(page);
    const order = await topIds(page);
    await button(page, "Enregistrer").click();
    await expect(page.getByRole("banner").locator(".nano-save-state")).toHaveText("Enregistré");
    await button(page, "Nouveau").click();
    await expect(editor(page)).toHaveText("");
    await setFakeFiles(page, { nextOpen: "expose.nano" });
    await button(page, "Ouvrir…").click();
    await expect(editor(page).locator("h1").nth(1)).toHaveText("Conclusion");
    expect(await topIds(page)).toEqual(order);
    expect(await allIds(page)).toEqual(ids);
    // Le plan n'est jamais enregistré dans le fichier (critère 8).
    const saved = (await fakeFiles(page)).files["expose.nano"] ?? "";
    expect(saved).not.toMatch(/outline|nano-outline/);
  });

  test("critère 5 : un déplacement déclenche la sauvegarde automatique du fichier", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, EXPOSE);
    const original = (await fakeFiles(page)).files["expose.nano"];
    await openPlan(page);
    await dragBefore(page, "Conclusion", "Le vent");
    await expect
      .poll(async () => (await fakeFiles(page)).files["expose.nano"], { timeout: 10_000 })
      .not.toBe(original);
    const saved = JSON.parse((await fakeFiles(page)).files["expose.nano"] ?? "{}") as {
      content: DocumentJson;
    };
    expect(saved.content.content?.[0]?.attrs?.id).toBe("h-c");
  });

  test("critère 7 : le plan suit la frappe sans la ralentir, avec 200 titres", async ({ page }) => {
    const content: DocumentJson[] = [];
    for (let index = 0; index < 200; index += 1) {
      content.push(
        heading(`h-${index}`, (index % 3) + 1, `Partie ${index}`),
        para(`p-${index}`, 1),
      );
    }
    await start(page);
    await openDocument(page, content);
    await openPlan(page);
    await expect(panel(page).locator(".nano-outline-item")).toHaveCount(200);
    await editor(page).getByText("Partie 198", { exact: true }).click();
    await page.keyboard.press("End");
    // Délai de chaque touche, de son appui à l'image affichée après la suivante.
    await page.evaluate(() => {
      const delays: number[] = [];
      (window as unknown as { __keyDelays: number[] }).__keyDelays = delays;
      window.addEventListener(
        "keydown",
        () => {
          const started = performance.now();
          requestAnimationFrame(() =>
            requestAnimationFrame(() => delays.push(performance.now() - started)),
          );
        },
        { capture: true },
      );
    });
    await page.keyboard.type(" été 🌾 fin", { delay: 30 });
    await expect(item(page, "Partie 198 été 🌾 fin")).toBeVisible();
    const delays = await page.evaluate(
      () => (window as unknown as { __keyDelays: number[] }).__keyDelays,
    );
    expect(delays.length).toBeGreaterThan(5);
    const average = delays.reduce((sum, delay) => sum + delay, 0) / delays.length;
    // Deux images à 60 par seconde font 33 ms : la frappe n'attend pas le plan.
    expect(average).toBeLessThan(80);
    await expect(item(page, "Partie 198 été 🌾 fin")).toHaveAttribute("aria-current", "location");
    // Déplacer une partie de Titre 1 trois parties plus haut reste rapide.
    await item(page, "Partie 198 été 🌾 fin").focus();
    for (let step = 0; step < 3; step += 1) await page.keyboard.press("Alt+Shift+ArrowUp");
    await expect(panel(page).locator(".nano-outline-item").nth(189)).toHaveText(/^Partie 198/);
    await expect(panel(page).locator(".nano-outline-item").nth(190)).toHaveText(/^Partie 199/);
  });

  test("critère 2 : le numéro de page d'un titre suit le texte ajouté au-dessus de lui", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, [heading("h-1", 1, "Début"), para("p-1"), heading("h-2", 1, "Suite")]);
    await openPlan(page);
    const number = item(page, "Suite").locator(".nano-outline-page");
    await expect(number).toHaveText("1");
    await editor(page).getByText(SENTENCE.trim().slice(0, 20)).click();
    await page.keyboard.press("End");
    for (let index = 0; index < 40; index += 1) await page.keyboard.press("Enter");
    await expect(number).toHaveText("2");
  });

  test("cas limite : une partie déposée dans le document ou ailleurs ne change rien", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, EXPOSE);
    const before = await ydocJson(page);
    await openPlan(page);
    const from = await item(page, "Conclusion").boundingBox();
    const to = await editor(page).getByText("Histoire").boundingBox();
    if (!from || !to) throw new Error("invisible");
    await page.mouse.move(from.x + 20, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 10, to.y + 5, { steps: 8 });
    await page.mouse.move(to.x + 12, to.y + 6);
    await page.mouse.up();
    await expect(panel(page).locator(".nano-outline-drop")).toHaveCount(0);
    expect(await ydocJson(page)).toEqual(before);
  });

  test("cas limite : une partie posée à la fin d'un document qui finit par un tableau", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, [
      heading("h-1", 1, "Premier"),
      para("p-1"),
      heading("h-2", 1, "Second"),
      table("t"),
    ]);
    await openPlan(page);
    const from = await item(page, "Premier").boundingBox();
    const end = await panel(page).locator(".nano-outline-end").boundingBox();
    if (!from || !end) throw new Error("invisible");
    await page.mouse.move(from.x + 20, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(end.x + 20, end.y + end.height / 2, { steps: 8 });
    await page.mouse.move(end.x + 22, end.y + end.height / 2 + 1);
    await expect(panel(page).locator(".nano-outline-end.nano-outline-drop")).toHaveCount(1);
    await page.mouse.up();
    const ids = await topIds(page);
    expect(ids.slice(0, 2)).toEqual(["h-2", "table"]);
    // Le paragraphe vide qui suit un tableau final (T1.8) part avec lui ; rien d'autre n'est ajouté.
    expect(ids).toHaveLength(5);
    expect(ids.slice(-2)).toEqual(["h-1", "p-1"]);
    await page.keyboard.press("ControlOrMeta+z");
    expect((await topIds(page)).slice(0, 4)).toEqual(["h-1", "p-1", "h-2", "table"]);
  });

  test("critère 8 : le panneau ne s'imprime pas et n'entre pas dans le document", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, EXPOSE);
    await openPlan(page);
    await page.emulateMedia({ media: "print" });
    await expect(panel(page)).toBeHidden();
    await expect(page.locator(".nano-page")).toBeVisible();
    // Le décalage de la page à côté du plan ne s'imprime pas.
    await expect(page.locator(".nano-workspace")).toHaveCSS("padding-left", "0px");
    await page.emulateMedia({ media: "screen" });
    await expect(panel(page)).toBeVisible();
    expect(JSON.stringify(await ydocJson(page))).not.toContain("Plan");
  });
});
