// Outils communs aux tests de mise en forme (lots A et C) : démarrer l'éditeur avec la fausse
// implémentation de FileStore, lire le Y.Doc, sélectionner un texte, coller depuis une autre
// application, enregistrer puis rouvrir un document.
import { expect, type Page } from "@playwright/test";
import type { DocumentJson } from "../../src/core/types";
import { fakeFiles, installFakeFileStore, setFakeFiles } from "./fakeFileStore";

/** Agent utilisateur d'un Mac, pour vérifier les raccourcis propres au Mac (Cmd, Option). */
export const MAC_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/** Agent utilisateur d'un PC Windows. */
export const WINDOWS_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";

export function editor(page: Page) {
  return page.getByRole("textbox", { name: "Document" });
}

export function button(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

/** Ouvre l'application avec la fausse implémentation de FileStore et place le curseur dans l'éditeur. */
export async function start(page: Page) {
  await installFakeFileStore(page);
  await page.goto("/");
  await editor(page).click();
  return editor(page);
}

/** Contenu du Y.Doc affiché, au format JSON de Tiptap. */
export async function ydocJson(page: Page): Promise<DocumentJson> {
  return page.evaluate(() => {
    if (!window.__nanoTest) throw new Error("window.__nanoTest absent");
    return window.__nanoTest.documentJson();
  });
}

/** Blocs de premier niveau du Y.Doc. */
export async function topBlocks(page: Page): Promise<DocumentJson[]> {
  return (await ydocJson(page)).content ?? [];
}

/**
 * Attend que l'éditeur ait lu la sélection du navigateur. Chrome traite les touches avant
 * l'événement `selectionchange`, qui met à jour la sélection de ProseMirror : sans cette attente,
 * un raccourci tapé juste après un déplacement au clavier s'appliquerait à l'ancienne sélection.
 */
export async function settleSelection(page: Page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

/** Laisse passer le délai de regroupement des annulations de Yjs, pour isoler l'étape suivante. */
export async function waitUndoGroup(page: Page) {
  await page.waitForTimeout(700);
}

/**
 * Enregistre le document (« Enregistrer », fichier `document.nano`), crée un document vide avec
 * « Nouveau », puis rouvre le fichier enregistré. Renvoie le contenu relu.
 */
export async function saveAndReopen(page: Page): Promise<DocumentJson> {
  await button(page, "Enregistrer").click();
  await expect.poll(async () => (await fakeFiles(page)).files["document.nano"]).toBeTruthy();
  await expect(page.locator(".nano-save-state-saved")).toBeVisible();
  await button(page, "Nouveau").click();
  await expect(editor(page)).toHaveText("");
  await setFakeFiles(page, { nextOpen: "document.nano" });
  await button(page, "Ouvrir…").click();
  await expect(page.getByRole("banner").getByText("document", { exact: true })).toBeVisible();
  await expect(editor(page)).not.toHaveText("");
  return ydocJson(page);
}

/** Sélectionne le texte exact `text` dans l'éditeur (double-clic impossible sur plusieurs mots). */
export async function selectText(page: Page, text: string) {
  await page.evaluate((target) => {
    const root = document.querySelector(".nano-editor");
    if (!root) throw new Error("éditeur absent");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent?.indexOf(target) ?? -1;
      if (index >= 0) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + target.length);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        return;
      }
    }
    throw new Error(`texte absent : ${target}`);
  }, text);
  await settleSelection(page);
}

/** Colle `html` (et son texte) comme le ferait le presse-papiers d'une autre application. */
export async function pasteFromOtherApp(page: Page, html: string, plain = "") {
  await page.evaluate(
    ([data, text]) => {
      const transfer = new DataTransfer();
      transfer.setData("text/html", data ?? "");
      transfer.setData("text/plain", text ?? "");
      document
        .querySelector(".nano-editor")
        ?.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }),
        );
    },
    [html, plain],
  );
}

/** HTML et texte mis dans le presse-papiers par la dernière copie. */
export async function readClipboard(page: Page): Promise<{ html: string; text: string }> {
  return page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    if (!item) throw new Error("presse-papiers vide");
    return {
      html: await (await item.getType("text/html")).text(),
      text: await (await item.getType("text/plain")).text(),
    };
  });
}
