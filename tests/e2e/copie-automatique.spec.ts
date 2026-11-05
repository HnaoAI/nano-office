// Tests d'interface du ticket T2.21 (copier automatiquement la sélection), dans Chromium. Le
// presse-papiers est lu par l'API du navigateur, avec les permissions de lecture et d'écriture.
import { expect, test, type Page } from "@playwright/test";
import { fakeFiles } from "./fakeFileStore";
import {
  button,
  editor,
  readClipboard,
  settleSelection,
  start,
  waitUndoGroup,
  ydocJson,
} from "./formatHelpers";
import { insertTable } from "./tableHelpers";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

/** Texte mis dans le presse-papiers « depuis une autre application », avant chaque essai. */
const BEFORE = "copié ailleurs";

async function fillClipboard(page: Page, text = BEFORE) {
  await page.evaluate((value) => navigator.clipboard.writeText(value), text);
}

async function clipboardText(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

function settingsDialog(page: Page) {
  return page.getByRole("dialog", { name: "Réglages" });
}

function autoCopyBox(page: Page) {
  return settingsDialog(page).getByRole("checkbox", {
    name: "Copier automatiquement la sélection",
  });
}

/** Coche ou décoche la case dans les Réglages, puis « Enregistrer ». */
async function setAutoCopy(page: Page, on: boolean) {
  await button(page, "Réglages").click();
  await autoCopyBox(page).setChecked(on);
  await settingsDialog(page).getByRole("button", { name: "Enregistrer" }).click();
  await expect(settingsDialog(page)).toHaveCount(0);
  await editor(page).click();
}

/** Boîte autour d'un texte exact du document, pour y viser la souris. */
async function textBox(page: Page, text: string) {
  return page.evaluate((target) => {
    const root = document.querySelector(".nano-editor");
    const walker = document.createTreeWalker(root ?? document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent?.indexOf(target) ?? -1;
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + target.length);
      const { left, right, top, bottom } = range.getBoundingClientRect();
      return { left, right, y: (top + bottom) / 2 };
    }
    throw new Error(`texte absent : ${target}`);
  }, text);
}

/** Sélectionne en glissant la souris du début de `text` à la fin de `last` (par défaut `text`). */
async function dragOver(page: Page, text: string, last = text) {
  const box = await textBox(page, text);
  const end = await textBox(page, last);
  await page.mouse.move(box.left + 1, box.y);
  await page.mouse.down();
  await page.mouse.move((box.left + end.right) / 2, box.y, { steps: 4 });
  await page.mouse.move(end.right - 0.5, end.y, { steps: 4 });
  await page.mouse.up();
  await settleSelection(page);
}

/** Double-clique au milieu de `word`. */
async function doubleClickWord(page: Page, word: string) {
  const box = await textBox(page, word);
  await page.mouse.dblclick((box.left + box.right) / 2, box.y);
  await settleSelection(page);
}

/** Attend que le presse-papiers ait reçu `text`, ou vérifie qu'il garde son ancien contenu. */
async function expectClipboard(page: Page, text: string) {
  await expect.poll(() => clipboardText(page)).toBe(text);
}

async function expectClipboardUnchanged(page: Page) {
  // Laisse passer la copie différée d'une tâche, si elle devait avoir lieu.
  await page.waitForTimeout(150);
  expect(await clipboardText(page)).toBe(BEFORE);
}

test.describe("T2.21 : copier automatiquement la sélection", () => {
  test("critère 1 : la case est dans les Réglages, décochée au départ, avec sa phrase", async ({
    page,
  }) => {
    await start(page);
    await button(page, "Réglages").click();
    await expect(autoCopyBox(page)).not.toBeChecked();
    await expect(autoCopyBox(page)).toHaveAccessibleDescription(
      "Le texte sélectionné à la souris est copié, comme avec Ctrl+C (Cmd+C sur Mac).",
    );
  });

  test("critère 3 : case décochée, une sélection à la souris ne copie rien", async ({ page }) => {
    await start(page);
    await page.keyboard.type("Une phrase à sélectionner.");
    await fillClipboard(page);
    await dragOver(page, "phrase à");
    await expectClipboardUnchanged(page);
    await doubleClickWord(page, "sélectionner");
    await expectClipboardUnchanged(page);
  });

  test("critère 2 : cochée, un glisser copie la sélection comme Ctrl+C, avec sa mise en forme", async ({
    page,
  }) => {
    await start(page);
    await setAutoCopy(page, true);
    await page.keyboard.type("Avant ");
    await page.keyboard.press("ControlOrMeta+B");
    await page.keyboard.type("en gras");
    await page.keyboard.press("ControlOrMeta+B");
    await page.keyboard.type(" après.");
    await fillClipboard(page);
    await dragOver(page, "Avant", "en gras");
    await expectClipboard(page, "Avant en gras");
    const auto = await readClipboard(page);
    expect(auto.html).toMatch(/<strong>en gras<\/strong>/);
    // Même contenu qu'avec Ctrl+C sur la même sélection.
    await fillClipboard(page);
    await page.keyboard.press("ControlOrMeta+C");
    await expectClipboard(page, "Avant en gras");
    expect(await readClipboard(page)).toEqual(auto);
  });

  test("critère 2 : cochée, un double clic copie le mot, qui se colle plus loin dans le document", async ({
    page,
  }) => {
    await start(page);
    await setAutoCopy(page, true);
    await page.keyboard.type("Bonjour à tous. ");
    await fillClipboard(page);
    await doubleClickWord(page, "Bonjour");
    await expectClipboard(page, "Bonjour");
    await page.keyboard.press("End");
    await settleSelection(page);
    await page.keyboard.press("ControlOrMeta+v");
    await expect(editor(page)).toHaveText("Bonjour à tous. Bonjour");
  });

  test("critère 2 : un simple clic, qui ne sélectionne rien, ne change pas le presse-papiers", async ({
    page,
  }) => {
    await start(page);
    await setAutoCopy(page, true);
    await page.keyboard.type("Un texte sans sélection.");
    await fillClipboard(page);
    const box = await textBox(page, "texte");
    await page.mouse.click((box.left + box.right) / 2, box.y);
    await expectClipboardUnchanged(page);
  });

  test("critère 3 : une sélection au clavier n'est pas copiée", async ({ page }) => {
    await start(page);
    await setAutoCopy(page, true);
    await page.keyboard.type("Sélection au clavier.");
    await fillClipboard(page);
    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("ControlOrMeta+A");
    await expectClipboardUnchanged(page);
  });

  test("critère 3 : décochée de nouveau, plus rien n'est copié", async ({ page }) => {
    await start(page);
    await setAutoCopy(page, true);
    await page.keyboard.type("Un mot.");
    await setAutoCopy(page, false);
    await fillClipboard(page);
    await doubleClickWord(page, "mot");
    await expectClipboardUnchanged(page);
  });

  test("critère 4 : une sélection dans un tableau est copiée, pas celle d'un champ de recherche", async ({
    page,
  }) => {
    await start(page);
    await setAutoCopy(page, true);
    await insertTable(page, 2, 2);
    await page.keyboard.type("Cellule écrite");
    await fillClipboard(page);
    await doubleClickWord(page, "Cellule");
    await expectClipboard(page, "Cellule");
    // Le champ de la recherche ne copie rien tout seul.
    await page.keyboard.press("ControlOrMeta+F");
    const field = page.getByRole("textbox", { name: "Rechercher", exact: true });
    await field.fill("mot cherché");
    await fillClipboard(page);
    await field.dblclick();
    await expectClipboardUnchanged(page);
  });

  test("critère 5 : la copie ne modifie pas le document, qui reste enregistré", async ({
    page,
  }) => {
    await start(page);
    await setAutoCopy(page, true);
    await page.keyboard.type("Texte déjà enregistré.");
    await waitUndoGroup(page);
    await button(page, "Enregistrer").click();
    await expect(page.locator(".nano-save-state-saved")).toBeVisible();
    const file = (await fakeFiles(page)).files["document.nano"];
    const before = await ydocJson(page);
    await fillClipboard(page);
    await dragOver(page, "déjà enregistré");
    await expectClipboard(page, "déjà enregistré");
    await page.waitForTimeout(300);
    await expect(page.locator(".nano-save-state-saved")).toBeVisible();
    expect(await ydocJson(page)).toEqual(before);
    expect((await fakeFiles(page)).files["document.nano"]).toBe(file);
  });

  test("critère 6 : le réglage survit au rechargement et n'est pas dans le fichier enregistré", async ({
    page,
  }) => {
    await start(page);
    await setAutoCopy(page, true);
    await page.keyboard.type("Réglage retenu.");
    await button(page, "Enregistrer").click();
    await expect.poll(async () => (await fakeFiles(page)).files["document.nano"]).toBeTruthy();
    const saved = (await fakeFiles(page)).files["document.nano"] ?? "";
    expect(saved).not.toMatch(/autoCopy|Copier automatiquement/);
    await page.reload();
    await editor(page).click();
    await button(page, "Réglages").click();
    await expect(autoCopyBox(page)).toBeChecked();
  });

  test("cas limites : accents, emojis et très long texte sont copiés en entier", async ({
    page,
  }) => {
    await start(page);
    await setAutoCopy(page, true);
    const long = "Été 🎉 déjà là ! ".repeat(150).trim();
    await page.evaluate((text) => {
      const view = document.querySelector(".nano-editor");
      view?.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: (() => {
            const transfer = new DataTransfer();
            transfer.setData("text/plain", text);
            return transfer;
          })(),
          bubbles: true,
          cancelable: true,
        }),
      );
    }, long);
    await expect(editor(page)).toHaveText(long);
    await fillClipboard(page);
    // Retour au début : le collage a fait défiler la page jusqu'à la fin du texte.
    await page.keyboard.press("ControlOrMeta+Home");
    await settleSelection(page);
    // Triple clic : sélection à la souris de tout le paragraphe.
    const first = await textBox(page, "Été");
    await page.mouse.click(first.right, first.y, { clickCount: 3 });
    await settleSelection(page);
    await expect.poll(() => clipboardText(page)).toContain("🎉 déjà");
    const copied = await clipboardText(page);
    expect(copied.startsWith("Été 🎉")).toBe(true);
    expect(copied.trim()).toBe(long);
  });

  test("critère 7 : presse-papiers refusé, rien ne casse et Ctrl+C fonctionne toujours", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // Navigateur qui refuse la copie demandée par la page (execCommand et API asynchrone).
    await page.addInitScript(() => {
      document.execCommand = () => {
        throw new DOMException("refusé", "NotAllowedError");
      };
      Object.defineProperty(navigator.clipboard, "write", {
        value: () => Promise.reject(new DOMException("refusé", "NotAllowedError")),
      });
    });
    await start(page);
    await setAutoCopy(page, true);
    await page.keyboard.type("Texte à copier.");
    await fillClipboard(page);
    await doubleClickWord(page, "copier");
    await expectClipboardUnchanged(page);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("copier");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+c");
    await expectClipboard(page, "copier");
    expect(errors).toEqual([]);
  });

  test("critère 8 : la copie automatique n'envoie rien sur le réseau", async ({ page }) => {
    const requests: string[] = [];
    await start(page);
    await setAutoCopy(page, true);
    await page.keyboard.type("Rien ne part.");
    page.on("request", (request) => requests.push(request.url()));
    await doubleClickWord(page, "part");
    await expectClipboard(page, "part");
    expect(requests.filter((url) => !url.startsWith("http://localhost"))).toEqual([]);
  });

  test("critère 2 : un Shift+clic qui étend la sélection la copie", async ({ page }) => {
    await start(page);
    await setAutoCopy(page, true);
    await page.keyboard.type("Début milieu fin.");
    await fillClipboard(page);
    const first = await textBox(page, "Début");
    const end = await textBox(page, "milieu");
    await page.mouse.click(first.left + 0.5, first.y);
    await expectClipboardUnchanged(page);
    await page.keyboard.down("Shift");
    await page.mouse.click(end.right - 0.5, end.y);
    await page.keyboard.up("Shift");
    await expectClipboard(page, "Début milieu");
  });
});
