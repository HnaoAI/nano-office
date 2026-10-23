// Tests d'interface du ticket T2.8 (repères de page, compteur de pages et saut de page), dans Chromium :
// repères et numéros d'un document de 3 pages, compteur pendant le défilement, saut de page (insertion,
// suppression, annulation, réouverture, collage), rien d'enregistré ni d'imprimé, et nombre de pages
// comparé au PDF produit par Chromium.
import { expect, test, type Page } from "@playwright/test";
import { serializeDocument } from "../../src/core/fileFormat";
import { writePageSetup, type PageSetup } from "../../src/core/pageSetup";
import type { DocumentJson } from "../../src/core/types";
import { ydocFromJson } from "../core/helpers";
import { fakeFiles, setFakeFiles } from "./fakeFileStore";
import {
  button,
  editor,
  MAC_USER_AGENT,
  pasteFromOtherApp,
  saveAndReopen,
  start,
  topBlocks,
  waitAfterFocus,
  waitEditorFocus,
  WINDOWS_USER_AGENT,
} from "./formatHelpers";
import { insertWithButton, makeImage } from "./imageHelpers";

/** Phrase d'exemple, avec accents et emoji, assez longue pour passer sur plusieurs lignes. */
const SENTENCE =
  "Le cerf-volant de Zoé s'élève au-dessus des champs de blé, poussé par un vent d'été 🌾. ";

function text(value: string): DocumentJson {
  return { type: "text", text: value };
}

function para(id: string, sentences = 3): DocumentJson {
  return { type: "paragraph", attrs: { id }, content: [text(SENTENCE.repeat(sentences).trim())] };
}

function heading(id: string, level: number, value: string): DocumentJson {
  return { type: "heading", attrs: { id, level }, content: [text(value)] };
}

function table(id: string, rows: number): DocumentJson {
  return {
    type: "table",
    content: Array.from({ length: rows }, (_, row) => ({
      type: "tableRow",
      content: [0, 1, 2].map((col) => ({
        type: row === 0 ? "tableHeader" : "tableCell",
        attrs: { id: `${id}-${row}-${col}` },
        content: [
          {
            type: "paragraph",
            attrs: { id: `${id}-p-${row}-${col}` },
            content: [text(row === 0 ? `Colonne ${col}` : `Ligne ${row}, été`)],
          },
        ],
      })),
    })),
  };
}

function list(id: string, items: number): DocumentJson {
  return {
    type: "bulletList",
    content: Array.from({ length: items }, (_, index) => ({
      type: "listItem",
      attrs: { id: `${id}-li-${index}` },
      content: [para(`${id}-p-${index}`, 1)],
    })),
  };
}

const PAGE_BREAK = (id: string): DocumentJson => ({ type: "pageBreak", attrs: { id } });

/** Ouvre un document depuis un fichier, avec sa mise en page éventuelle. */
async function openDocument(page: Page, content: DocumentJson[], setup?: PageSetup) {
  const ydoc = ydocFromJson({ type: "doc", content });
  if (setup) writePageSetup(ydoc, setup);
  const file = serializeDocument({ id: crypto.randomUUID(), ydoc });
  await setFakeFiles(page, { files: { "expose.nano": file }, nextOpen: "expose.nano" });
  await button(page, "Ouvrir…").click();
  await expect(page.getByRole("banner").getByText("expose", { exact: true })).toBeVisible();
  await waitEditorFocus(page);
}

/** Exposé de trois pages : titres, paragraphes, liste, tableau. */
const THREE_PAGES: DocumentJson[] = [
  heading("h-1", 1, "Exposé sur le vent"),
  ...Array.from({ length: 6 }, (_, index) => para(`a-${index}`, 4)),
  heading("h-2", 2, "Les cerfs-volants"),
  list("l-1", 6),
  ...Array.from({ length: 2 }, (_, index) => para(`b-${index}`, 4)),
  table("t-1", 8),
  heading("h-3", 2, "Conclusion"),
  ...Array.from({ length: 4 }, (_, index) => para(`c-${index}`, 3)),
];

function marks(page: Page) {
  return page.locator(".nano-page-mark");
}

function counter(page: Page) {
  return page.locator(".nano-page-counter");
}

/** Nombre de pages d'un PDF, lu dans ses `/MediaBox`. */
function pdfPageCount(pdf: Buffer): number {
  return [...pdf.toString("latin1").matchAll(/\/MediaBox\s*\[/g)].length;
}

/** Attend que les repères soient calculés (deux images affichées) et renvoie le nombre de pages affiché. */
async function shownPageCount(page: Page): Promise<number> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const value = (await counter(page).textContent()) ?? "";
  const match = /sur (\d+)/.exec(value);
  return match ? Number(match[1]) : 0;
}

test.describe("T2.8 : repères de page", () => {
  test("critères 1 et 2 : un document de 3 pages a deux repères en pointillé, numérotés 2 et 3", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, THREE_PAGES);
    await expect(marks(page)).toHaveCount(2);
    await expect(page.locator(".nano-page-number")).toHaveText(["2", "3"]);
    const style = await marks(page)
      .first()
      .evaluate((mark) => {
        const line = getComputedStyle(mark);
        const number = getComputedStyle(mark.querySelector(".nano-page-number") as Element);
        const sheet = (mark.closest(".nano-page") as Element).getBoundingClientRect();
        const box = mark.getBoundingClientRect();
        const numberBox = (
          mark.querySelector(".nano-page-number") as Element
        ).getBoundingClientRect();
        const text = (document.querySelector(".nano-editor") as Element).getBoundingClientRect();
        return {
          border: `${line.borderTopWidth} ${line.borderTopStyle} ${line.borderTopColor}`,
          pointer: line.pointerEvents,
          edgeToEdge: Math.abs(box.left - sheet.left) < 1 && Math.abs(box.right - sheet.right) < 1,
          font: `${number.fontFamily.split(",")[0]?.replace(/"/g, "")} ${number.fontSize}`,
          color: number.color,
          inRightMargin: numberBox.left >= text.right,
          belowLine: numberBox.top >= box.top,
        };
      });
    expect(style).toEqual({
      border: "1px dashed rgb(212, 212, 209)",
      pointer: "none",
      edgeToEdge: true,
      font: "IBM Plex Mono 12px",
      color: "rgb(95, 95, 92)",
      inRightMargin: true,
      belowLine: true,
    });
  });

  test("critère 1 : le repère est entre deux lignes, ne cache aucun caractère et ne reçoit pas les clics", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, THREE_PAGES);
    await expect(marks(page)).toHaveCount(2);
    const result = await page.evaluate(() => {
      const editorElement = document.querySelector(".nano-editor") as HTMLElement;
      return Array.from(document.querySelectorAll(".nano-page-mark")).map((mark) => {
        mark.scrollIntoView({ block: "center" });
        // Rectangles des caractères : ceux de chaque nœud de texte, pas ceux des éléments.
        const glyphs: DOMRect[] = [];
        const walker = document.createTreeWalker(editorElement, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          glyphs.push(...Array.from(range.getClientRects()).filter((rect) => rect.height > 0));
        }
        const y = mark.getBoundingClientRect().top;
        const crossing = glyphs
          .filter((rect) => rect.top + 1 < y && rect.bottom - 1 > y)
          .map((rect) => `${String(rect.top)}-${String(rect.bottom)} @${String(y)}`);
        const editorBox = editorElement.getBoundingClientRect();
        const hit = document.elementFromPoint(editorBox.left + 40, y);
        return { crossing, hitInEditor: editorElement.contains(hit) };
      });
    });
    expect(result).toEqual([
      { crossing: [], hitInEditor: true },
      { crossing: [], hitInEditor: true },
    ]);
    // Les repères ne décalent rien : la hauteur de l'éditeur est celle de son contenu.
    const heights = await page.evaluate(() => {
      const editorElement = document.querySelector(".nano-editor") as HTMLElement;
      const last = editorElement.lastElementChild as HTMLElement;
      return {
        editor: editorElement.getBoundingClientRect().bottom,
        last: last.getBoundingClientRect().bottom,
      };
    });
    expect(heights.editor - heights.last).toBeLessThan(40);
  });

  test("critère 4 : les repères suivent la frappe, sans attendre", async ({ page }) => {
    await start(page);
    await openDocument(page, THREE_PAGES);
    await expect(marks(page)).toHaveCount(2);
    await waitAfterFocus(page);
    await editor(page).press("ControlOrMeta+End");
    const blocksBefore = (await topBlocks(page)).length;
    for (let index = 0; index < 30; index++) await editor(page).press("Enter");
    await expect.poll(async () => (await topBlocks(page)).length).toBe(blocksBefore + 30);
    // Repères et compteur relus ensemble, une fois la frappe terminée : une page de plus au moins.
    const shown = async () => {
      const count = await marks(page).count();
      const text = (await counter(page).textContent()) ?? "";
      return text.endsWith(`sur ${String(count + 1)}`) ? count : -1;
    };
    await expect.poll(shown).toBeGreaterThan(2);
    for (let index = 0; index < 30; index++) await editor(page).press("Backspace");
    await expect(marks(page)).toHaveCount(2);
    await expect(counter(page)).toContainText("sur 3");
  });

  test("critère 4 : un document de 100 pages se calcule sans bloquer la saisie", async ({
    page,
  }) => {
    await start(page);
    const content: DocumentJson[] = [];
    for (let section = 0; section < 100; section++) {
      content.push(heading(`h-${section}`, 2, `Partie ${section + 1}`));
      for (let index = 0; index < 7; index++) content.push(para(`p-${section}-${index}`, 3));
    }
    await openDocument(page, content);
    await expect.poll(() => shownPageCount(page)).toBeGreaterThanOrEqual(100);
    await page.evaluate(() => performance.clearMeasures("nano-page-layout"));
    await editor(page).press("ControlOrMeta+Home");
    await editor(page).pressSequentially("Bonjour Zoé ", { delay: 20 });
    await expect(editor(page)).toContainText("Bonjour Zoé");
    const durations = await page.evaluate(() =>
      performance.getEntriesByName("nano-page-layout").map((entry) => entry.duration),
    );
    expect(durations.length).toBeGreaterThan(0);
    // Au plus un calcul par caractère tapé (une fois par image affichée), et chacun court.
    expect(durations.length).toBeLessThanOrEqual(12 + 2);
    expect(Math.max(...durations)).toBeLessThan(100);
  });
});

test.describe("T2.8 : compteur de pages", () => {
  test("critère 5 : un document vide affiche « Page 1 sur 1 »", async ({ page }) => {
    await start(page);
    await expect(counter(page)).toHaveText("Page 1 sur 1");
    await expect(marks(page)).toHaveCount(0);
  });

  test("critère 5 : le compteur suit la page visible au milieu de la fenêtre pendant le défilement", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, THREE_PAGES);
    await expect(counter(page)).toHaveText("Page 1 sur 3");
    await expect(counter(page)).toBeInViewport();
    const scrollToMark = async (index: number) => {
      await page.evaluate((markIndex) => {
        const mark = document.querySelectorAll(".nano-page-mark")[markIndex] as HTMLElement;
        const y = mark.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, y - window.innerHeight / 2 + 50);
      }, index);
    };
    await scrollToMark(0);
    await expect(counter(page)).toHaveText("Page 2 sur 3");
    // Le pied de page reste visible pendant le défilement.
    await expect(counter(page)).toBeInViewport();
    await scrollToMark(1);
    await expect(counter(page)).toHaveText("Page 3 sur 3");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(counter(page)).toHaveText("Page 1 sur 3");
  });
});

test.describe("T2.8 : saut de page", () => {
  for (const [computer, userAgent, shortcut] of [
    ["PC", WINDOWS_USER_AGENT, "Control+Enter"],
    ["Mac", MAC_USER_AGENT, "Meta+Enter"],
  ] as const) {
    test(`critère 6 (${computer}) : ${shortcut.replace("Control", "Ctrl").replace("Meta", "Cmd")} insère un saut de page, et le texte qui suit commence une nouvelle page`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ userAgent });
      const page = await context.newPage();
      await start(page);
      await editor(page).pressSequentially("Introduction");
      await editor(page).press(shortcut);
      await editor(page).pressSequentially("Conclusion");
      const blocks = await topBlocks(page);
      expect(blocks.map((block) => block.type)).toEqual(["paragraph", "pageBreak", "paragraph"]);
      await expect(marks(page)).toHaveCount(1);
      await expect(counter(page)).toContainText("sur 2");
      const positions = await page.evaluate(() => {
        const mark = document.querySelector(".nano-page-mark") as HTMLElement;
        const paragraphs = document.querySelectorAll(".nano-editor p");
        return {
          mark: mark.getBoundingClientRect().top,
          before: (paragraphs[0] as Element).getBoundingClientRect().bottom,
          after: (paragraphs[1] as Element).getBoundingClientRect().top,
        };
      });
      expect(positions.before).toBeLessThan(positions.mark);
      expect(positions.after).toBeGreaterThan(positions.mark);
      await context.close();
    });
  }

  test("critère 6 : le bouton « Saut de page » de la barre coupe le paragraphe au curseur", async ({
    page,
  }) => {
    await start(page);
    await editor(page).pressSequentially("Avant après");
    for (let index = 0; index < 5; index++) await editor(page).press("ArrowLeft");
    await button(page, "Saut de page").click();
    await expect(editor(page)).toBeFocused();
    const blocks = await topBlocks(page);
    expect(blocks.map((block) => block.type)).toEqual(["paragraph", "pageBreak", "paragraph"]);
    expect(blocks[0]?.content?.[0]?.text).toBe("Avant ");
    expect(blocks[2]?.content?.[0]?.text).toBe("après");
    // Le curseur est au début de la nouvelle page.
    await editor(page).pressSequentially("et ");
    expect((await topBlocks(page))[2]?.content?.[0]?.text).toBe("et après");
  });

  test("critère 7 : une ligne discrète « Saut de page », sélectionnée d'un clic, retirée par Retour arrière ou Suppr", async ({
    page,
  }) => {
    await start(page);
    await editor(page).pressSequentially("Un");
    await editor(page).press("ControlOrMeta+Enter");
    await editor(page).pressSequentially("Deux");
    await editor(page).press("ControlOrMeta+Enter");
    await editor(page).pressSequentially("Trois");
    const breaks = page.locator(".nano-editor .nano-page-break");
    await expect(breaks).toHaveCount(2);
    const look = await breaks.first().evaluate((element) => {
      const label = getComputedStyle(element, "::before");
      return {
        label: label.content,
        align: getComputedStyle(element).textAlign,
        text: element.textContent,
      };
    });
    expect(look).toEqual({ label: '"Saut de page"', align: "center", text: "" });
    await breaks.first().click();
    await expect(breaks.first()).toHaveClass(/ProseMirror-selectednode/);
    await editor(page).press("Backspace");
    await expect(breaks).toHaveCount(1);
    await breaks.first().click();
    await editor(page).press("Delete");
    await expect(breaks).toHaveCount(0);
    expect((await topBlocks(page)).map((block) => block.type)).toEqual([
      "paragraph",
      "paragraph",
      "paragraph",
    ]);
  });

  test("critère 7 : Ctrl/Cmd+Z annule un saut de page en une fois, sans annuler la frappe", async ({
    page,
  }) => {
    await start(page);
    await editor(page).pressSequentially("Début");
    await editor(page).press("ControlOrMeta+Enter");
    await expect(page.locator(".nano-editor .nano-page-break")).toHaveCount(1);
    await editor(page).press("ControlOrMeta+z");
    await expect(page.locator(".nano-editor .nano-page-break")).toHaveCount(0);
    await expect(editor(page)).toHaveText("Début");
    await expect(marks(page)).toHaveCount(0);
  });

  test("critère 8 : le saut de page est un bloc avec son identifiant, gardé à l'enregistrement et à la réouverture", async ({
    page,
  }) => {
    await start(page);
    await editor(page).pressSequentially("Avant");
    await editor(page).press("ControlOrMeta+Enter");
    await editor(page).pressSequentially("Après");
    const before = await topBlocks(page);
    const id = before[1]?.attrs?.id;
    expect(typeof id).toBe("string");
    const reopened = await saveAndReopen(page);
    expect(reopened.content?.map((block) => block.type)).toEqual([
      "paragraph",
      "pageBreak",
      "paragraph",
    ]);
    expect(reopened.content?.[1]?.attrs?.id).toBe(id);
    await expect(marks(page)).toHaveCount(1);
  });

  test("critère 8 : un saut de page copié puis collé dans Nano Buro reste un saut de page", async ({
    page,
  }) => {
    await start(page);
    await editor(page).pressSequentially("Un");
    await editor(page).press("ControlOrMeta+Enter");
    await editor(page).pressSequentially("Deux");
    await editor(page).press("ControlOrMeta+a");
    await editor(page).press("ControlOrMeta+c");
    await editor(page).press("ControlOrMeta+End");
    await editor(page).press("Enter");
    await editor(page).press("ControlOrMeta+v");
    const blocks = await topBlocks(page);
    expect(blocks.filter((block) => block.type === "pageBreak")).toHaveLength(2);
    const ids = blocks.map((block) => block.attrs?.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("critère 8 : un saut de page collé depuis Word (`page-break-before`) est reconnu", async ({
    page,
  }) => {
    await start(page);
    await pasteFromOtherApp(
      page,
      "<p class=MsoNormal>Premier<span><br clear=all style='mso-special-character:line-break;page-break-before:always'></span></p>" +
        "<p class=MsoNormal>Deuxième</p>" +
        "<p class=MsoNormal style='page-break-before:always'>Troisième</p>",
    );
    const types = (await topBlocks(page)).map((block) => block.type);
    expect(types.filter((type) => type === "pageBreak")).toHaveLength(2);
    expect(types.indexOf("pageBreak")).toBe(1);
    await expect(marks(page)).toHaveCount(2);
  });
});

test.describe("T2.8 : discrétion", () => {
  test("critère 9 : ni repère, ni numéro, ni compteur dans le fichier enregistré", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, THREE_PAGES);
    await expect(marks(page)).toHaveCount(2);
    await editor(page).press("End");
    await editor(page).pressSequentially(" !");
    await button(page, "Enregistrer").click();
    await expect
      .poll(async () => (await fakeFiles(page)).files["expose.nano"] ?? "")
      .toContain("Exposé sur le vent !");
    const saved = (await fakeFiles(page)).files["expose.nano"] ?? "";
    for (const forbidden of ["nano-page-mark", "nano-page-number", "Page 1 sur", "Saut de page"]) {
      expect(saved).not.toContain(forbidden);
    }
  });

  test("critère 9 : les repères et le libellé « Saut de page » ne s'impriment pas, le saut de page coupe la page", async ({
    page,
  }) => {
    await start(page);
    await editor(page).pressSequentially("Avant");
    await editor(page).press("ControlOrMeta+Enter");
    await editor(page).pressSequentially("Après");
    await expect(marks(page)).toHaveCount(1);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".nano-page-marks")).toBeHidden();
    const printed = await page.locator(".nano-editor .nano-page-break").evaluate((element) => ({
      label: getComputedStyle(element, "::before").content,
      height: element.getBoundingClientRect().height,
      breakBefore: getComputedStyle(element).breakBefore,
    }));
    expect(printed).toEqual({ label: "none", height: 0, breakBefore: "page" });
    await page.emulateMedia({ media: "screen" });
    expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true }))).toBe(2);
  });
});

test.describe("T2.8 : nombre de pages comparé au PDF de Chromium", () => {
  test("critère 3 : exposé avec titres, liste et tableau (portrait, marges Normales)", async ({
    page,
  }) => {
    await start(page);
    await openDocument(page, THREE_PAGES);
    const shown = await shownPageCount(page);
    expect(shown).toBe(3);
    expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true }))).toBe(shown);
  });

  test("critère 3 : lettre longue avec une image et des sauts de page (marges Étroites)", async ({
    page,
  }) => {
    await start(page);
    await openDocument(
      page,
      [
        heading("h-1", 1, "Lettre à Zoé"),
        ...Array.from({ length: 9 }, (_, index) => para(`a-${index}`, 5)),
        PAGE_BREAK("br-1"),
        heading("h-2", 2, "Souvenirs"),
        ...Array.from({ length: 12 }, (_, index) => para(`b-${index}`, 2)),
        heading("h-3", 3, "Dernier mot"),
        para("c-1", 6),
      ],
      { orientation: "portrait", margins: { top: 1.27, bottom: 1.27, left: 1.27, right: 1.27 } },
    );
    await editor(page).press("ControlOrMeta+Home");
    await insertWithButton(page, [
      await makeImage(page, "photo.png", { width: 1200, height: 900, type: "image/png" }),
    ]);
    await expect(page.locator(".nano-editor img")).toHaveCount(1);
    const shown = await shownPageCount(page);
    expect(shown).toBeGreaterThanOrEqual(3);
    expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true }))).toBe(shown);
  });

  test("critère 3 : tableau long et titres en bas de page (paysage, marges Larges)", async ({
    page,
  }) => {
    await start(page);
    await openDocument(
      page,
      [
        heading("h-1", 1, "Inventaire"),
        para("a-1", 2),
        table("t-1", 30),
        heading("h-2", 2, "Remarques"),
        ...Array.from({ length: 8 }, (_, index) => para(`b-${index}`, 4)),
        list("l-1", 10),
        heading("h-3", 2, "Annexe"),
        table("t-2", 8),
      ],
      { orientation: "landscape", margins: { top: 3.5, bottom: 3.5, left: 3.5, right: 3.5 } },
    );
    const shown = await shownPageCount(page);
    expect(shown).toBeGreaterThanOrEqual(4);
    expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true }))).toBe(shown);
  });
});
