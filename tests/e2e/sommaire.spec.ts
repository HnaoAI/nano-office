// Tests d'interface du ticket T2.17 (sommaire automatique), dans Chromium : insertion depuis la barre et
// depuis le plan, lignes en retrait avec points de conduite et numéros de page, clic vers un titre, mise à
// jour, compte des mots, sélection et suppression comme une image, réouverture, PDF et export Word.
import { expect, test, type Page } from "@playwright/test";
import type { DocumentJson } from "../../src/core/types";
import { fakeFiles } from "./fakeFileStore";
import {
  button,
  editor,
  saveAndReopen,
  settleSelection,
  start,
  topBlocks,
  waitUndoGroup,
} from "./formatHelpers";
import {
  exportDocx,
  fakeExportPicker,
  heading,
  openDocument,
  pages,
  pdfPagesText,
  printToPdf,
  settleLayout,
} from "./pageHelpers";

const TOC: DocumentJson = { type: "tableOfContents", attrs: { id: "toc-1" } };

/** Rapport de quatre pages environ : un sommaire, puis trois niveaux de titres. */
const REPORT: DocumentJson[] = [
  { type: "paragraph", attrs: { id: "p-title" }, content: [{ type: "text", text: "Rapport" }] },
  TOC,
  heading("h-1", 1, "Introduction"),
  ...pages(1, "a"),
  heading("h-2", 2, "Méthode d'été"),
  ...pages(1, "b"),
  heading("h-3", 3, "Les cerfs-volants de Zoé"),
  ...pages(1, "c"),
  heading("h-4", 1, "Conclusion"),
  ...pages(1, "d"),
];

function toc(page: Page) {
  return editor(page).locator(".nano-toc");
}

function line(page: Page, text: string) {
  return toc(page).locator(".nano-toc-entry", { hasText: text });
}

/** Numéros de page affichés par le sommaire, ligne par ligne. */
async function tocNumbers(page: Page): Promise<string[]> {
  return toc(page).locator(".nano-toc-page").allTextContents();
}

function wordCount(page: Page) {
  return page.locator(".nano-footer").getByRole("button", { name: /mots?( sur|$)/ });
}

function openPlan(page: Page) {
  return page
    .getByRole("toolbar", { name: "Mise en forme" })
    .getByRole("button", { name: "Plan" })
    .click();
}

test.describe("T2.17 : sommaire automatique", () => {
  test("critère 1 : « Insérer un sommaire » dans la barre l'insère à l'endroit du curseur", async ({
    page,
  }) => {
    await start(page);
    await page.keyboard.type("Rapport");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Suite");
    await page.keyboard.press("Home");
    await settleSelection(page);
    await button(page, "Insérer un sommaire").click();
    await expect(toc(page)).toHaveCount(1);
    const blocks = await topBlocks(page);
    expect(blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "tableOfContents",
      "paragraph",
    ]);
    await expect(toc(page).locator(".nano-toc-title")).toHaveText("Sommaire");
    await expect(toc(page).locator(".nano-toc-empty")).toBeVisible();
    // Le curseur est après le sommaire : la frappe continue dans « Suite ».
    await expect(editor(page)).toBeFocused();
    await page.keyboard.type("» ");
    await expect(editor(page).locator("p").last()).toHaveText("» Suite");
  });

  test("critère 1 : « Insérer un sommaire » est aussi dans le plan", async ({ page }) => {
    await start(page);
    await openDocument(
      page,
      REPORT.filter((block) => block !== TOC),
    );
    await openPlan(page);
    const plan = page.getByRole("complementary", { name: "Plan" });
    await plan.getByRole("button", { name: "Insérer un sommaire" }).click();
    await expect(toc(page)).toHaveCount(1);
    // Le curseur était au début du document : le sommaire se place avant le premier paragraphe.
    const blocks = await topBlocks(page);
    expect(blocks[0]?.type).toBe("tableOfContents");
    await expect(toc(page).locator(".nano-toc-entry")).toHaveCount(4);
  });

  test("critère 2 : Titre 1 à 3 en retrait selon le niveau, avec points de conduite et numéros de page", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, REPORT);
    await settleLayout(page);
    await expect(toc(page).locator(".nano-toc-text")).toHaveText([
      "Introduction",
      "Méthode d'été",
      "Les cerfs-volants de Zoé",
      "Conclusion",
    ]);
    const look = await toc(page)
      .locator(".nano-toc-entry")
      .evaluateAll((items) =>
        items.map((item) => {
          const text = item.querySelector(".nano-toc-text")?.getBoundingClientRect();
          const leader = item.querySelector(".nano-toc-leader") as HTMLElement;
          return { left: text?.left ?? 0, leader: leader.getBoundingClientRect().width };
        }),
      );
    const [one, two, three] = look;
    expect((two?.left ?? 0) - (one?.left ?? 0)).toBeGreaterThan(10);
    expect((three?.left ?? 0) - (two?.left ?? 0)).toBeGreaterThan(10);
    for (const item of look) expect(item.leader).toBeGreaterThan(40);
    // Mêmes numéros que le plan, calculés par les repères de page (T2.8).
    await openPlan(page);
    // Le plan calcule ses numéros après son ouverture : on attend ses quatre numéros avant de comparer.
    const planNumbers = page.locator(".nano-outline-page");
    await expect(planNumbers).toHaveCount(4);
    await expect(planNumbers.last()).not.toHaveText("");
    await expect.poll(() => tocNumbers(page)).toEqual(await planNumbers.allTextContents());
    const numbers = (await tocNumbers(page)).map(Number);
    expect(numbers[0]).toBeGreaterThanOrEqual(1);
    expect(numbers[3]).toBeGreaterThan(numbers[0] ?? 0);
  });

  test("critère 2 : un clic sur une ligne amène au titre, sous la barre figée", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await start(page);
    await openDocument(page, REPORT);
    await line(page, "Conclusion").locator("a").click();
    await expect(editor(page)).toBeFocused();
    await settleSelection(page);
    await page.keyboard.type("» ");
    const title = editor(page).locator("h1", { hasText: "Conclusion" });
    await expect(title).toHaveText("» Conclusion");
    const top = await page.locator(".nano-top").boundingBox();
    const box = await title.boundingBox();
    const below = (box?.y ?? 0) - ((top?.y ?? 0) + (top?.height ?? 0));
    expect(below).toBeGreaterThanOrEqual(0);
    expect(below).toBeLessThan(60);
  });

  test("critère 3 : il suit les titres et les pages, et ne compte jamais dans les mots", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, REPORT);
    await settleLayout(page);
    const before = await tocNumbers(page);
    const words = await wordCount(page).textContent();
    // Renommer un titre change sa ligne.
    await editor(page).locator("h1", { hasText: "Conclusion" }).click();
    await page.keyboard.press("End");
    await settleSelection(page);
    await page.keyboard.type(" 🌬️");
    await expect(line(page, "Conclusion").locator(".nano-toc-text")).toHaveText("Conclusion 🌬️");
    // Un nouveau Titre 2 ajoute une ligne, à sa place.
    await page.keyboard.press("Enter");
    await page.keyboard.type("Annexe");
    await page.keyboard.press("ControlOrMeta+Shift+Digit2");
    await expect(toc(page).locator(".nano-toc-text").last()).toHaveText("Annexe");
    await expect(toc(page).locator('.nano-toc-entry[data-level="2"]').last()).toHaveText(/Annexe/);
    // Une page ajoutée avant l'introduction décale les numéros.
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("End");
    await settleSelection(page);
    await page.keyboard.press("ControlOrMeta+Enter");
    await settleLayout(page);
    await expect
      .poll(async () => (await tocNumbers(page)).slice(0, 4))
      .toEqual(before.map((number) => String(Number(number) + 1)));
    // Le compte des mots ignore le sommaire : seuls « 🌬️ » et « Annexe » s'ajoutent.
    const total = Number((words ?? "").replace(/\D/g, ""));
    await expect
      .poll(async () => Number(((await wordCount(page).textContent()) ?? "").replace(/\D/g, "")))
      .toBe(total + 2);
  });

  test("critère 4 : on le sélectionne et on le supprime comme une image ; ses lignes ne se modifient pas", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, REPORT);
    await toc(page).locator(".nano-toc-title").click();
    await expect(toc(page)).toHaveClass(/ProseMirror-selectednode/);
    // Les lignes ne se modifient pas à la main : le sommaire n'est pas modifiable au clavier.
    await expect(toc(page)).toHaveAttribute("contenteditable", "false");
    await page.keyboard.press("Delete");
    await expect(toc(page)).toHaveCount(0);
    await waitUndoGroup(page);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(toc(page)).toHaveCount(1);
    const blocks = await topBlocks(page);
    expect(blocks[1]).toEqual(TOC);
  });

  test("critère 4 : enregistré avec son identifiant et retrouvé à la réouverture, sans changer la version", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, REPORT, undefined, "document");
    await editor(page).locator("h1", { hasText: "Introduction" }).click();
    await page.keyboard.press("End");
    await settleSelection(page);
    await page.keyboard.type(" !");
    await saveAndReopen(page);
    const saved = JSON.parse((await fakeFiles(page)).files["document.nano"] ?? "{}") as {
      version: number;
      content: { content: DocumentJson[] };
    };
    expect(saved.version).toBe(2);
    expect(saved.content.content[1]).toEqual(TOC);
    await expect(line(page, "Introduction !")).toHaveCount(1);
  });

  test("critère 5 : dans le PDF, les numéros sont exacts et les lignes cliquables", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, REPORT);
    const pdf = await printToPdf(page);
    const texts = pdfPagesText(pdf);
    const titles = ["Introduction", "Méthode d'été", "Conclusion"];
    // Page où le titre est imprimé : la dernière qui contient son texte, car la page 1 porte le sommaire.
    const printed = titles.map((title) =>
      texts.reduce((found, text, index) => (text.includes(title) ? index + 1 : found), 0),
    );
    expect(printed[2]).toBeGreaterThan(printed[0] ?? 0);
    const numbers = await tocNumbers(page);
    expect([numbers[0], numbers[1], numbers[3]]).toEqual(printed.map(String));
    // Le sommaire imprimé porte les mêmes numéros.
    for (const [index, title] of titles.entries()) {
      expect(texts[0]).toMatch(new RegExp(`${title}[^\\n]*\\n?[^\\n]*${printed[index]}`));
    }
    // Une ligne cliquable par titre : un lien interne du PDF vers sa page.
    const raw = pdf.toString("latin1");
    expect((raw.match(/\/Subtype\s*\/Link/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test("critère 5 : dans l'export Word, un champ de table des matières avec ses numéros", async ({
    page,
  }) => {
    await fakeExportPicker(page);
    await start(page);
    await openDocument(page, REPORT);
    await settleLayout(page);
    const numbers = await tocNumbers(page);
    const word = await exportDocx(page);
    expect(word.document).toContain("TOC \\h \\o &quot;1-3&quot;");
    expect(word.document).toMatch(new RegExp(`Introduction</w:t><w:tab/><w:t[^>]*>${numbers[0]}<`));
    expect(word.document).toMatch(new RegExp(`Conclusion</w:t><w:tab/><w:t[^>]*>${numbers[3]}<`));
    expect(word.document).toContain("w:bookmarkStart");
  });
});
