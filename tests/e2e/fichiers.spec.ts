// Tests d'interface du ticket T0c (ouvrir et enregistrer), dans Chromium.
// L'accès aux fichiers est remplacé par une fausse implémentation de FileStore (fakeFileStore.ts).
import { expect, test, type Page } from "@playwright/test";
import { serializeDocument } from "../../src/core/fileFormat";
import type { DocumentJson } from "../../src/core/types";
import { paragraph, SAMPLE_DOCUMENT, ydocFromJson } from "../core/helpers";
import { clearCalls, fakeFiles, installFakeFileStore, setFakeFiles } from "./fakeFileStore";

const CORRUPTED_MESSAGE =
  "Ce fichier est abîmé et ne peut pas être ouvert. Il n'a pas été modifié.";

/** Texte d'un fichier `.nano` contenant `json`. */
function nanoFile(json: DocumentJson, id: string = crypto.randomUUID()): string {
  return serializeDocument({ id, ydoc: ydocFromJson(json) });
}

/** Ouvre l'application avec la fausse implémentation de FileStore et place le curseur dans l'éditeur. */
async function start(page: Page, mode: "file-system-access" | "download" = "file-system-access") {
  await installFakeFileStore(page, mode);
  await page.goto("/");
  await editor(page).click();
}

function editor(page: Page) {
  return page.getByRole("textbox", { name: "Document" });
}

function button(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

/** Contenu du Y.Doc affiché, au format JSON de Tiptap. */
async function ydocJson(page: Page): Promise<DocumentJson> {
  return page.evaluate(() => {
    if (!window.__nanoTest) throw new Error("window.__nanoTest absent");
    return window.__nanoTest.documentJson();
  });
}

/** Ouvre un fichier de la fausse implémentation avec le bouton « Ouvrir… ». */
async function openFile(page: Page, name: string, text?: string) {
  if (text !== undefined) {
    const { files } = await fakeFiles(page);
    await setFakeFiles(page, { files: { ...files, [name]: text } });
  }
  await setFakeFiles(page, { nextOpen: name });
  await button(page, "Ouvrir…").click();
}

/** Contenu enregistré d'un fichier de la fausse implémentation, relu comme un fichier `.nano`. */
async function savedFile(page: Page, name: string) {
  const text = (await fakeFiles(page)).files[name];
  if (text === undefined) throw new Error(`Fichier non enregistré : ${name}`);
  return JSON.parse(text) as { id: string; content: DocumentJson };
}

test("critère 1 : « Nouveau » ouvre un document vide avec un nouvel id", async ({ page }) => {
  await start(page);
  await page.keyboard.type("Premier");
  await button(page, "Enregistrer").click();
  const first = await savedFile(page, "document.nano");

  await button(page, "Nouveau").click();
  await expect(editor(page)).toHaveText("");
  await page.keyboard.type("Second");
  await setFakeFiles(page, { nextSaveName: "second.nano" });
  await button(page, "Enregistrer").click();
  const second = await savedFile(page, "second.nano");
  expect(second.id).not.toBe(first.id);
});

test("critère 1 : « Nouveau » demande une confirmation s'il y a des modifications non enregistrées", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Texte à garder");

  const messages: string[] = [];
  page.once("dialog", (dialog) => {
    messages.push(dialog.message());
    void dialog.dismiss();
  });
  await button(page, "Nouveau").click();
  expect(messages).toHaveLength(1);
  await expect(editor(page)).toHaveText("Texte à garder");

  page.once("dialog", (dialog) => void dialog.accept());
  await button(page, "Nouveau").click();
  await expect(editor(page)).toHaveText("");
});

test("critère 1 : « Nouveau » sans modification ne demande rien", async ({ page }) => {
  await start(page);
  let dialogs = 0;
  page.on("dialog", (dialog) => {
    dialogs += 1;
    void dialog.dismiss();
  });
  await button(page, "Nouveau").click();
  await page.keyboard.type("Bonjour");
  await button(page, "Enregistrer").click();
  await button(page, "Nouveau").click();
  await expect(editor(page)).toHaveText("");
  expect(dialogs).toBe(0);
});

test("critère 2 : après « Nouveau », « Enregistrer » demande un emplacement", async ({ page }) => {
  await start(page);
  const original = nanoFile(SAMPLE_DOCUMENT);
  await openFile(page, "ancien.nano", original);
  await button(page, "Nouveau").click();
  await editor(page).click();
  await page.keyboard.type("Nouveau texte");
  await clearCalls(page);
  await setFakeFiles(page, { nextSaveName: "neuf.nano" });

  await page.keyboard.press("ControlOrMeta+s");
  await expect.poll(async () => (await fakeFiles(page)).calls).toContain("picker");
  expect((await savedFile(page, "neuf.nano")).content.content?.[0]?.content?.[0]?.text).toBe(
    "Nouveau texte",
  );
  expect((await fakeFiles(page)).files["ancien.nano"]).toBe(original);
});

test("critère 3 : « Enregistrer sous » propose document.nano et laisse choisir l'emplacement", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Lettre");
  await setFakeFiles(page, { nextSaveName: "lettre.nano" });
  await button(page, "Enregistrer sous…").click();
  await expect
    .poll(async () => (await fakeFiles(page)).calls)
    .toEqual(["saveAs:document.nano", "picker"]);
  await expect(page).toHaveTitle("lettre.nano - Nano Office");
});

test("critère 4 : après un premier enregistrement, « Enregistrer » et Ctrl/Cmd+S réécrivent le même fichier sans rien demander", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Version 1");
  await setFakeFiles(page, { nextSaveName: "lettre.nano" });
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page).toHaveTitle("lettre.nano - Nano Office");
  await clearCalls(page);

  await page.keyboard.type(" et 2");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page).toHaveTitle("lettre.nano - Nano Office");
  await page.keyboard.type(" et 3");
  await button(page, "Enregistrer").click();
  await expect(page).toHaveTitle("lettre.nano - Nano Office");

  expect((await fakeFiles(page)).calls).toEqual(["save", "save"]);
  const text = (await savedFile(page, "lettre.nano")).content.content?.[0]?.content?.[0]?.text;
  expect(text).toBe("Version 1 et 2 et 3");
});

test("critère 5 : après « Ouvrir », Ctrl/Cmd+S réécrit directement le fichier ouvert", async ({
  page,
}) => {
  await start(page);
  await openFile(page, "ouvert.nano", nanoFile(SAMPLE_DOCUMENT, "id-ouvert"));
  await expect(editor(page)).toContainText("Bonjour");
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" fin");
  await clearCalls(page);

  await page.keyboard.press("ControlOrMeta+s");
  await expect(page).toHaveTitle("ouvert.nano - Nano Office");
  expect((await fakeFiles(page)).calls).toEqual(["save"]);
  const saved = await savedFile(page, "ouvert.nano");
  expect(saved.id).toBe("id-ouvert");
  expect(JSON.stringify(saved.content)).toContain(" fin");
});

for (const where of ["dans l'éditeur", "hors de l'éditeur"]) {
  test(`critère 6 : Ctrl/Cmd+S n'ouvre jamais la fenêtre « Enregistrer la page » du navigateur (${where})`, async ({
    page,
  }) => {
    await start(page);
    await page.keyboard.type("Texte");
    // Le gestionnaire de l'application est en phase de capture : un écouteur en phase de bulle
    // voit donc si l'action par défaut du navigateur a été empêchée.
    await page.evaluate(() => {
      (window as unknown as { __prevented: boolean[] }).__prevented = [];
      window.addEventListener("keydown", (event) => {
        if (event.key.toLowerCase() === "s") {
          (window as unknown as { __prevented: boolean[] }).__prevented.push(
            event.defaultPrevented,
          );
        }
      });
    });
    if (where === "hors de l'éditeur") {
      await page.locator("h1").click();
      await expect(editor(page)).not.toBeFocused();
    }
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(async () => (await fakeFiles(page)).calls).toContain("save");
    expect(
      await page.evaluate(() => (window as unknown as { __prevented: boolean[] }).__prevented),
    ).toEqual([true]);
  });
}

test("critère 8 : sur Safari et Firefox, « Enregistrer » télécharge le fichier et recommande Chrome ou Edge", async ({
  page,
}) => {
  await start(page, "download");
  await page.keyboard.type("Texte");
  await button(page, "Enregistrer").click();
  await expect(page.getByRole("status")).toContainText("téléchargé");
  await expect(page.getByRole("status")).toContainText("Chrome ou Edge");
  expect((await fakeFiles(page)).files["document.nano"]).toBeDefined();
});

test("critère 9 : « Ouvrir » charge un fichier .nano, puis un second sans mélange avec le premier", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Brouillon en cours");
  page.on("dialog", (dialog) => void dialog.accept());

  await openFile(page, "premier.nano", nanoFile(SAMPLE_DOCUMENT));
  expect(await ydocJson(page)).toEqual(JSON.parse(nanoFile(SAMPLE_DOCUMENT)).content);

  const second: DocumentJson = {
    type: "doc",
    content: [paragraph("b-1", { text: "Second fichier" })],
  };
  await openFile(page, "second.nano", nanoFile(second));
  await expect(editor(page)).toHaveText("Second fichier");
  expect(await ydocJson(page)).toEqual(second);
});

test("critère 10 : après « Ouvrir », Ctrl/Cmd+Z n'agit pas sur le document précédent", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Ancien texte");
  page.on("dialog", (dialog) => void dialog.accept());
  const opened: DocumentJson = {
    type: "doc",
    content: [paragraph("o-1", { text: "Fichier ouvert" })],
  };
  await openFile(page, "ouvert.nano", nanoFile(opened));
  await expect(editor(page)).toHaveText("Fichier ouvert");

  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor(page)).toHaveText("Fichier ouvert");
  expect(await ydocJson(page)).toEqual(opened);
  await expect(button(page, "Annuler")).toBeDisabled();
});

test("critère 10 : après « Nouveau », Ctrl/Cmd+Z n'agit pas sur le document précédent", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Ancien texte");
  page.on("dialog", (dialog) => void dialog.accept());
  await button(page, "Nouveau").click();
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor(page)).toHaveText("");
  await expect(button(page, "Annuler")).toBeDisabled();
});

test("critère 11 : enregistrer puis rouvrir redonne le même contenu (texte, gras, italique, paragraphes, accents, emojis)", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Bonjour ");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type("Élodie");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.press("ControlOrMeta+i");
  await page.keyboard.type(", ça va ?");
  await page.keyboard.press("ControlOrMeta+i");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Œuvre à côté de l'île 👨‍👩‍👧 🇫🇷 😀");
  const before = await ydocJson(page);

  await button(page, "Enregistrer").click();
  await expect(page).toHaveTitle("document.nano - Nano Office");
  await button(page, "Nouveau").click();
  await expect(editor(page)).toHaveText("");
  await openFile(page, "document.nano");
  await expect(editor(page).locator("strong")).toHaveText("Élodie");
  await expect(editor(page).locator("em")).toHaveText(", ça va ?");
  expect(await ydocJson(page)).toEqual(before);
});

const INVALID_FILES: [string, string, string][] = [
  ["un JSON invalide", "{ pas du json", "Ce fichier n'est pas un document Nano Office."],
  ["un fichier qui n'est pas un .nano", "Bonjour", "Ce fichier n'est pas un document Nano Office."],
  [
    "un fichier d'une version inconnue",
    JSON.stringify({ ...JSON.parse(nanoFile(SAMPLE_DOCUMENT)), version: 99 }),
    "Ce document vient d'une version de Nano Office que cette application ne sait pas lire.",
  ],
];

for (const [label, text, message] of INVALID_FILES) {
  test(`critère 12 : ${label} affiche un message clair, et le document en cours reste intact`, async ({
    page,
  }) => {
    await start(page);
    await page.keyboard.type("Document en cours");
    await button(page, "Enregistrer").click();
    await expect(page).toHaveTitle("document.nano - Nano Office");
    const before = await ydocJson(page);

    await openFile(page, "mauvais.nano", text);
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(editor(page)).toHaveText("Document en cours");
    expect(await ydocJson(page)).toEqual(before);
    await expect(page).toHaveTitle("document.nano - Nano Office");

    // Le fichier refusé ne devient pas le fichier courant : Ctrl/Cmd+S réécrit toujours document.nano.
    await clearCalls(page);
    await editor(page).click();
    await page.keyboard.type(" modifié");
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page).toHaveTitle("document.nano - Nano Office");
    expect((await fakeFiles(page)).calls).toEqual(["save"]);
    expect((await fakeFiles(page)).files["mauvais.nano"]).toBe(text);
  });
}

test("critère 13 : le titre de la fenêtre indique le nom du fichier, avec • s'il y a des modifications non enregistrées", async ({
  page,
}) => {
  await start(page);
  await expect(page).toHaveTitle("Sans titre - Nano Office");
  await page.keyboard.type("A");
  await expect(page).toHaveTitle("• Sans titre - Nano Office");
  await setFakeFiles(page, { nextSaveName: "courses.nano" });
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page).toHaveTitle("courses.nano - Nano Office");
  await page.keyboard.type("B");
  await expect(page).toHaveTitle("• courses.nano - Nano Office");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page).toHaveTitle("courses.nano - Nano Office");
});

test("critère 15 : un fichier abîmé affiche le message rassurant, n'est jamais réécrit, et le document en cours reste intact", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Document en cours");
  const before = await ydocJson(page);
  // Depuis la PR n° 16, le fichier est refusé même si son état Yjs contient du texte (critère 14).
  const damaged = JSON.stringify({ ...JSON.parse(nanoFile(SAMPLE_DOCUMENT)), content: "abîmé" });
  page.on("dialog", (dialog) => void dialog.accept());

  await openFile(page, "abime.nano", damaged);
  await expect(page.getByRole("alert")).toHaveText(CORRUPTED_MESSAGE);
  expect(await ydocJson(page)).toEqual(before);
  await expect(page).toHaveTitle("• Sans titre - Nano Office");

  // Ctrl/Cmd+S ensuite ne doit pas viser le fichier abîmé.
  await setFakeFiles(page, { nextSaveName: "autre.nano" });
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page).toHaveTitle("autre.nano - Nano Office");
  expect((await fakeFiles(page)).files["abime.nano"]).toBe(damaged);
});
