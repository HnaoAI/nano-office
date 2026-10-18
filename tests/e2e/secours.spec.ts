// Tests d'interface du ticket T0d (copie de secours et récupération), dans Chromium.
// La copie de secours utilise le vrai IndexedDB du navigateur ; chaque test a un contexte neuf, donc un stockage vide.
// L'accès aux fichiers est remplacé par la fausse implémentation de FileStore (fakeFileStore.ts),
// dont les fichiers sont remis à zéro à chaque chargement de page.
import { expect, test, type Page } from "@playwright/test";
import { serializeDocument } from "../../src/core/fileFormat";
import type { DocumentJson } from "../../src/core/types";
import { paragraph, ydocFromJson } from "../core/helpers";
import { fakeFiles, installFakeFileStore, setFakeFiles } from "./fakeFileStore";

const BACKUP_PREFIX = "nano-office-backup:";
const RECOVERED_MESSAGE = "Ce document a été récupéré depuis la copie de secours de ce navigateur.";
const QUESTION =
  "Ce fichier a des modifications non enregistrées, gardées dans la copie de secours.";
const RECOVER = "Récupérer les modifications non enregistrées";
const OPEN_AS_IS = "Ouvrir le fichier tel quel";

const FILE_ID = "8f0c5a2e-6d1b-4c3a-9e7f-2b4d6a8c0e1f";
const FILE_TEXT = "Texte du fichier, avec accents é à ç et emoji 😀";

/** Texte d'un fichier `.nano` contenant un paragraphe `text`. */
function nanoFile(text: string, id: string = crypto.randomUUID()): string {
  const json: DocumentJson = { type: "doc", content: [paragraph("p-1", { text })] };
  return serializeDocument({ id, ydoc: ydocFromJson(json) });
}

async function start(page: Page) {
  await installFakeFileStore(page);
  await page.goto("/");
  await editor(page).click();
}

function editor(page: Page) {
  return page.getByRole("textbox", { name: "Document" });
}

function button(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

/** Ouvre `name` (contenu `text`) avec « Ouvrir… ». */
async function openFile(page: Page, name: string, text: string) {
  const { files } = await fakeFiles(page);
  await setFakeFiles(page, { files: { ...files, [name]: text }, nextOpen: name });
  await button(page, "Ouvrir…").click();
}

/** Place le curseur à la fin du document et tape `text`. */
async function typeAtEnd(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(text);
}

/** Accepte toutes les confirmations « modifications perdues » de la page. */
function acceptConfirms(page: Page) {
  page.on("dialog", (dialog) => void dialog.accept().catch(() => undefined));
}

/** Noms des bases IndexedDB de copie de secours. */
async function backupNames(page: Page): Promise<string[]> {
  const databases = await page.evaluate(() => indexedDB.databases());
  return databases.map((db) => db.name ?? "").filter((name) => name.startsWith(BACKUP_PREFIX));
}

/**
 * Attend que les écritures en cours dans les copies de secours soient terminées : une transaction
 * en lecture ouverte après elles ne se termine qu'après elles (ordre des transactions d'IndexedDB).
 */
async function flushBackups(page: Page) {
  const names = await backupNames(page);
  await page.evaluate(async (dbNames) => {
    for (const name of dbNames) {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve) => {
        const transaction = db.transaction("updates", "readonly");
        transaction.objectStore("updates").count();
        transaction.oncomplete = () => resolve();
      });
      db.close();
    }
  }, names);
}

/**
 * Ouvre le fichier `lettre.nano`, le modifie sans l'enregistrer, puis passe à un document vide :
 * la copie de secours de ce fichier diffère alors du fichier.
 */
async function leaveUnsavedChanges(page: Page) {
  await openFile(page, "lettre.nano", nanoFile(FILE_TEXT, FILE_ID));
  await expect(editor(page)).toHaveText(FILE_TEXT);
  await typeAtEnd(page, " ajout");
  await flushBackups(page);
  page.once("dialog", (dialog) => void dialog.accept().catch(() => undefined));
  await button(page, "Nouveau").click();
  await expect(editor(page)).toHaveText("");
}

test("critère 1 : chaque modification est copiée dans le stockage du navigateur (IndexedDB)", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Bonjour");
  await flushBackups(page);
  expect(await backupNames(page)).toHaveLength(1);
});

test("critère 4 : après rechargement de la page, le dernier document modifié est restauré, avec un message de récupération", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Texte non enregistré, élève 👨‍👩‍👧");
  await flushBackups(page);
  await page.reload();
  await expect(editor(page)).toHaveText("Texte non enregistré, élève 👨‍👩‍👧");
  await expect(page.getByRole("status")).toHaveText(RECOVERED_MESSAGE);
  await expect(page).toHaveTitle("• Sans titre - Nano Office");
});

test("critère 4 : après une fermeture brutale de l'onglet, le dernier document modifié est restauré", async ({
  page,
  context,
}) => {
  await start(page);
  await page.keyboard.type("Avant la panne");
  await flushBackups(page);
  await page.close({ runBeforeUnload: false });

  const next = await context.newPage();
  await installFakeFileStore(next);
  await next.goto("/");
  await expect(editor(next)).toHaveText("Avant la panne");
  await expect(next.getByRole("status")).toHaveText(RECOVERED_MESSAGE);
});

test("critère 4 : un document enregistré n'est pas présenté comme une récupération", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Déjà enregistré");
  await button(page, "Enregistrer").click();
  await expect(page).toHaveTitle("document.nano - Nano Office");
  await flushBackups(page);
  await page.reload();
  await expect(editor(page)).toHaveText("");
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("critères 2 et 3 : ouvrir un fichier puis un autre ne mélange jamais leurs copies de secours", async ({
  page,
}) => {
  await start(page);
  acceptConfirms(page);
  const fileA = nanoFile("Fichier A");
  await openFile(page, "a.nano", fileA);
  await expect(editor(page)).toHaveText("Fichier A");
  await typeAtEnd(page, " modifié");
  await openFile(page, "b.nano", nanoFile("Fichier B"));
  await expect(editor(page)).toHaveText("Fichier B");
  await typeAtEnd(page, " modifié");
  await flushBackups(page);

  // Une copie par document : le document vide du départ, A et B.
  expect(await backupNames(page)).toHaveLength(3);

  // Le dernier document modifié (B) est restauré, sans rien de A.
  await page.reload();
  await expect(editor(page)).toHaveText("Fichier B modifié");

  // La copie de A ne contient que A.
  await openFile(page, "a.nano", fileA);
  await button(page, RECOVER).click();
  await expect(editor(page)).toHaveText("Fichier A modifié");
});

test("critère 5 : fermer l'onglet avec des modifications non enregistrées déclenche l'alerte du navigateur", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Pas encore enregistré");
  const dialog = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  expect((await dialog).type()).toBe("beforeunload");
  await (await dialog).dismiss();
});

test("critère 5 : fermer l'onglet sans modification non enregistrée ne déclenche pas d'alerte", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Enregistré");
  await button(page, "Enregistrer").click();
  await expect(page).toHaveTitle("document.nano - Nano Office");
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.type());
    void dialog.accept();
  });
  await page.close({ runBeforeUnload: true });
  expect(dialogs).toEqual([]);
});

test("critère 7 : rouvrir un fichier dont la copie de secours a le même contenu l'ouvre sans question", async ({
  page,
}) => {
  await start(page);
  await openFile(page, "lettre.nano", nanoFile(FILE_TEXT, FILE_ID));
  await typeAtEnd(page, " ajout");
  await button(page, "Enregistrer").click();
  await expect(page).toHaveTitle("lettre.nano - Nano Office");
  const saved = (await fakeFiles(page)).files["lettre.nano"] ?? "";
  await flushBackups(page);

  await page.reload();
  await openFile(page, "lettre.nano", saved);
  await expect(editor(page)).toHaveText(`${FILE_TEXT} ajout`);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page).toHaveTitle("lettre.nano - Nano Office");
});

test("critères 6 et 8 : si la copie de secours diffère du fichier, elle n'est pas appliquée et une question en français est posée", async ({
  page,
}) => {
  await start(page);
  await leaveUnsavedChanges(page);
  await openFile(page, "lettre.nano", nanoFile(FILE_TEXT, FILE_ID));

  const question = page.getByRole("alertdialog");
  await expect(question).toContainText(QUESTION);
  await expect(button(page, RECOVER)).toBeVisible();
  await expect(button(page, OPEN_AS_IS)).toBeVisible();
  await expect(editor(page)).toHaveCount(0);
});

test("critère 9 : « Récupérer » ouvre la copie de secours seule, sans fusion, et marque le document comme non enregistré", async ({
  page,
}) => {
  await start(page);
  await leaveUnsavedChanges(page);
  await openFile(page, "lettre.nano", nanoFile(FILE_TEXT, FILE_ID));
  await button(page, RECOVER).click();

  await expect(editor(page)).toHaveText(`${FILE_TEXT} ajout`);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page).toHaveTitle("• lettre.nano - Nano Office");
  const json = await page.evaluate(() => window.__nanoTest?.documentJson());
  expect(json?.content).toHaveLength(1);
});

test("critère 10 : « Ouvrir le fichier tel quel » efface la copie de secours, puis ouvre le fichier", async ({
  page,
}) => {
  await start(page);
  await leaveUnsavedChanges(page);
  await openFile(page, "lettre.nano", nanoFile(FILE_TEXT, FILE_ID));
  await button(page, OPEN_AS_IS).click();

  await expect(editor(page)).toHaveText(FILE_TEXT);
  await expect(page).toHaveTitle("lettre.nano - Nano Office");

  // La copie modifiée a disparu : rouvrir le fichier ne pose plus de question.
  await flushBackups(page);
  await button(page, "Nouveau").click();
  await openFile(page, "lettre.nano", nanoFile(FILE_TEXT, FILE_ID));
  await expect(editor(page)).toHaveText(FILE_TEXT);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("critère 11 : fermer l'onglet avant de choisir garde la copie de secours intacte", async ({
  page,
}) => {
  await start(page);
  await leaveUnsavedChanges(page);
  await openFile(page, "lettre.nano", nanoFile(FILE_TEXT, FILE_ID));
  await expect(page.getByRole("alertdialog")).toBeVisible();

  await page.reload();
  acceptConfirms(page);
  // Le dernier document modifié est restauré avec la modification.
  await expect(editor(page)).toHaveText(`${FILE_TEXT} ajout`);
  await openFile(page, "lettre.nano", nanoFile(FILE_TEXT, FILE_ID));
  await expect(page.getByRole("alertdialog")).toContainText(QUESTION);
  await button(page, RECOVER).click();
  await expect(editor(page)).toHaveText(`${FILE_TEXT} ajout`);
});
