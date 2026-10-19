// Tests d'interface du ticket U1b (indicateur d'enregistrement, messages et question de la copie de
// secours selon la charte docs/design/README.md), dans Chromium. Les fichiers passent par la fausse
// implémentation de FileStore (fakeFileStore.ts) ; la copie de secours utilise le vrai IndexedDB.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { serializeDocument } from "../../src/core/fileFormat";
import type { DocumentJson } from "../../src/core/types";
import { paragraph, ydocFromJson } from "../core/helpers";
import { flushBackups } from "./backupHelpers";
import { fakeFiles, installFakeFileStore, releaseWrites, setFakeFiles } from "./fakeFileStore";

const INK = "rgb(18, 18, 18)";
const WHITE = "rgb(255, 255, 255)";

const RECOVERED_MESSAGE =
  "Ce document a été récupéré depuis la copie de secours de ce navigateur. Enregistrez-le pour le garder dans un fichier.";
const SAVE_ERROR =
  "Le document n'a pas pu être enregistré. Réessayez, ou choisissez un autre emplacement avec « Enregistrer sous… ».";
const CORRUPTED_MESSAGE =
  "Ce fichier est abîmé et ne peut pas être ouvert. Il n'a pas été modifié.";
const NOT_NANO_MESSAGE = "Ce fichier n'est pas un document Nano Buro.";
const QUESTION =
  "Ce fichier a des modifications non enregistrées, gardées dans la copie de secours de ce navigateur.";
const RECOVER = "Récupérer les modifications non enregistrées";
const OPEN_AS_IS = "Ouvrir le fichier tel quel";
const CLOSE = "Fermer le message";
const FILE_ID = "3b7e1f0a-2c4d-4e6f-8a9b-0c1d2e3f4a5b";

function editor(page: Page) {
  return page.getByRole("textbox", { name: "Document" });
}

function button(scope: Page | Locator, name: string) {
  return scope.getByRole("button", { name, exact: true });
}

/** Indicateur d'enregistrement de l'en-tête. */
function indicator(page: Page) {
  return page.getByRole("banner").locator(".nano-save-state");
}

/** Cadre du message affiché (puce, texte, action, fermeture). */
function messageBox(page: Page) {
  return page.locator(".nano-message");
}

function style(locator: Locator, property: string): Promise<string> {
  return locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property,
  );
}

function overflowsHorizontally(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

function nanoFile(text: string, id: string = crypto.randomUUID()): string {
  const json: DocumentJson = { type: "doc", content: [paragraph("p-1", { text })] };
  return serializeDocument({ id, ydoc: ydocFromJson(json) });
}

async function start(page: Page, mode?: "download") {
  await installFakeFileStore(page, mode);
  await page.goto("/");
  await editor(page).click();
}

async function openFile(page: Page, name: string, text: string) {
  const { files } = await fakeFiles(page);
  await setFakeFiles(page, { files: { ...files, [name]: text }, nextOpen: name });
  await button(page.getByRole("toolbar", { name: "Fichier" }), "Ouvrir…").click();
}

/** Laisse un texte non enregistré puis recharge : le document revient avec le message de récupération. */
async function showRecoveredMessage(page: Page) {
  await start(page);
  await page.keyboard.type("Brouillon à récupérer, élève 😀");
  await flushBackups(page);
  await page.reload();
  await expect(page.getByRole("status")).toHaveText(RECOVERED_MESSAGE);
}

/** Modifie `lettre.nano` sans l'enregistrer, passe à « Nouveau », puis la rouvre : la question s'affiche. */
async function showBackupQuestion(page: Page) {
  await start(page);
  await openFile(page, "lettre.nano", nanoFile("Texte du fichier", FILE_ID));
  await expect(editor(page)).toHaveText("Texte du fichier");
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" ajout");
  await flushBackups(page);
  page.once("dialog", (dialog) => void dialog.accept().catch(() => undefined));
  await button(page, "Nouveau").click();
  await expect(editor(page)).toHaveText("");
  await openFile(page, "lettre.nano", nanoFile("Texte du fichier", FILE_ID));
  await expect(page.getByRole("alertdialog")).toBeVisible();
}

test("critère 1 : l'indicateur d'enregistrement est entre le nom du document et le groupe Fichier", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("A");
  const header = page.getByRole("banner");
  const boxes = await Promise.all(
    [
      header.getByText("Sans titre", { exact: true }),
      indicator(page),
      header.getByRole("toolbar", { name: "Fichier" }),
    ].map((locator) => locator.boundingBox()),
  );
  const xs = boxes.map((box) => box?.x ?? Number.NaN);
  expect([...xs].sort((a, b) => a - b)).toEqual(xs);
});

test("critère 2 : aucun indicateur tant que le document est vide et sans fichier, puis « Non enregistré » dès la première frappe", async ({
  page,
}) => {
  // Décision du product owner pendant la relecture de U1b : « Enregistré » ferait croire qu'un fichier existe.
  await start(page);
  await expect(indicator(page)).toHaveCount(0);

  await page.keyboard.type("É");
  await expect(indicator(page)).toHaveText("Non enregistré");
  expect(await style(indicator(page), "background-color")).toBe(INK);
  expect(await style(indicator(page), "color")).toBe(WHITE);

  // Effacer le texte d'un document sans fichier fait disparaître l'indicateur.
  await page.keyboard.press("Backspace");
  await expect(indicator(page)).toHaveCount(0);
});

test("critère 2 : « Enregistré » s'affiche avec le style de la charte une fois le document enregistré, même vide", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Lettre");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(indicator(page)).toHaveText("Enregistré");
  expect(await style(indicator(page), "background-color")).toBe(WHITE);

  // Un fichier enregistré puis vidé garde son indicateur : il a un fichier.
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await expect(indicator(page)).toHaveText("Non enregistré");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(indicator(page)).toHaveText("Enregistré");
});

test("critère 2 : « Nouveau » revient à une page blanche sans indicateur", async ({ page }) => {
  await start(page);
  await page.keyboard.type("Texte");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(indicator(page)).toHaveText("Enregistré");
  await button(page, "Nouveau").click();
  await expect(indicator(page)).toHaveCount(0);
});

test("critère 2 : l'indicateur affiche « Enregistrement… » pendant l'écriture, puis « Enregistré »", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Lettre à Mamie 💌");
  await setFakeFiles(page, { holdWrites: true });
  await page.keyboard.press("ControlOrMeta+s");
  await expect(indicator(page)).toHaveText("Enregistrement…");
  expect(await style(indicator(page), "background-color")).toBe(WHITE);

  await releaseWrites(page);
  await expect(indicator(page)).toHaveText("Enregistré");
  await expect(page).toHaveTitle("document.nano - Nano Buro");
});

test("critère 2 : une saisie pendant l'écriture laisse l'indicateur sur « Non enregistré » à la fin", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Début");
  await setFakeFiles(page, { holdWrites: true });
  await page.keyboard.press("ControlOrMeta+s");
  await expect(indicator(page)).toHaveText("Enregistrement…");
  await page.keyboard.type(" et suite");
  await releaseWrites(page);
  await expect(indicator(page)).toHaveText("Non enregistré");
});

test("critère 2 : un enregistrement échoué ou annulé laisse l'indicateur sur « Non enregistré »", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Texte");
  await setFakeFiles(page, { nextSaveFails: true });
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("alert")).toHaveText(SAVE_ERROR);
  await expect(indicator(page)).toHaveText("Non enregistré");

  await setFakeFiles(page, { nextSaveName: null });
  await button(page.getByRole("toolbar", { name: "Fichier" }), "Enregistrer sous…").click();
  await expect.poll(async () => (await fakeFiles(page)).calls).toContain("picker");
  await expect(indicator(page)).toHaveText("Non enregistré");
});

test("critère 3 : le message « document récupéré » est une information sur fond blanc, au texte inchangé", async ({
  page,
}) => {
  await showRecoveredMessage(page);
  expect(await style(messageBox(page), "background-color")).toBe(WHITE);
  expect(await style(messageBox(page), "box-shadow")).not.toBe("none");
  await expect(messageBox(page).locator(".nano-message-icon svg")).toHaveCount(1);
});

test("critère 3 : le message de téléchargement sur Safari et Firefox est une information sur fond blanc", async ({
  page,
}) => {
  await start(page, "download");
  await page.keyboard.type("Texte");
  await button(page, "Enregistrer").click();
  await expect(page.getByRole("status")).toHaveText(
    "Le fichier « document.nano » a été téléchargé dans votre dossier de téléchargements. Pour enregistrer directement dans le dossier de votre choix, utilisez Chrome ou Edge.",
  );
  expect(await style(messageBox(page), "background-color")).toBe(WHITE);
  await expect(button(messageBox(page), CLOSE)).toBeVisible();
});

for (const [label, text, message] of [
  [
    "fichier abîmé",
    JSON.stringify({ ...JSON.parse(nanoFile("Texte")), content: "abîmé" }),
    CORRUPTED_MESSAGE,
  ],
  ["fichier illisible", "{ pas du json", NOT_NANO_MESSAGE],
] as const) {
  test(`critère 3 : le message « ${label} » est une alerte sur fond noir, au texte inchangé`, async ({
    page,
  }) => {
    await start(page);
    await openFile(page, "mauvais.nano", text);
    await expect(page.getByRole("alert")).toHaveText(message);
    expect(await style(messageBox(page), "background-color")).toBe(INK);
    expect(await style(messageBox(page), "color")).toBe(WHITE);
    await expect(messageBox(page).locator(".nano-message-icon svg")).toHaveCount(1);
  });
}

test("critère 3 : l'échec d'enregistrement est une alerte sur fond noir, au texte inchangé", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Texte");
  await setFakeFiles(page, { nextSaveFails: true });
  await button(page, "Enregistrer").click();
  await expect(page.getByRole("alert")).toHaveText(SAVE_ERROR);
  expect(await style(messageBox(page), "background-color")).toBe(INK);
});

test("critère 4 : le bouton de fermeture fait disparaître le message, sans toucher au document", async ({
  page,
}) => {
  await showRecoveredMessage(page);
  await button(messageBox(page), CLOSE).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(messageBox(page)).toHaveCount(0);
  await expect(editor(page)).toHaveText("Brouillon à récupérer, élève 😀");
  await expect(indicator(page)).toHaveText("Non enregistré");
});

test("critère 4 : chaque message, alerte comprise, a un bouton de fermeture", async ({ page }) => {
  await start(page);
  await openFile(page, "mauvais.nano", "Bonjour");
  await expect(page.getByRole("alert")).toHaveText(NOT_NANO_MESSAGE);
  await button(messageBox(page), CLOSE).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("critère 4 : « Enregistrer sous… » du message « document récupéré » enregistre le document", async ({
  page,
}) => {
  await showRecoveredMessage(page);
  await setFakeFiles(page, { nextSaveName: "recupere.nano" });
  await button(messageBox(page), "Enregistrer sous…").click();
  await expect(page).toHaveTitle("recupere.nano - Nano Buro");
  expect((await fakeFiles(page)).calls).toEqual(["saveAs:document.nano", "picker"]);
  expect((await fakeFiles(page)).files["recupere.nano"]).toContain("Brouillon à récupérer");
  await expect(indicator(page)).toHaveText("Enregistré");
});

test("critère 4 : « Enregistrer sous… » de l'échec d'enregistrement propose un autre emplacement", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Texte");
  await setFakeFiles(page, { nextSaveFails: true });
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("alert")).toHaveText(SAVE_ERROR);

  await setFakeFiles(page, { nextSaveName: "ailleurs.nano", calls: [] });
  await button(messageBox(page), "Enregistrer sous…").click();
  await expect(page).toHaveTitle("ailleurs.nano - Nano Buro");
  expect((await fakeFiles(page)).calls).toEqual(["saveAs:document.nano", "picker"]);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("critère 4 : les autres messages ne proposent pas « Enregistrer sous… »", async ({ page }) => {
  await start(page);
  await openFile(page, "mauvais.nano", "Bonjour");
  await expect(page.getByRole("alert")).toHaveText(NOT_NANO_MESSAGE);
  await expect(button(messageBox(page), "Enregistrer sous…")).toHaveCount(0);
});

test("critère 5 : la question de la copie de secours est une boîte de dialogue centrée, au-dessus de la page estompée", async ({
  page,
}) => {
  await showBackupQuestion(page);
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(QUESTION);
  await expect(dialog).toContainText("lettre.nano");
  await expect(button(dialog, RECOVER)).toBeVisible();
  await expect(button(dialog, OPEN_AS_IS)).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");

  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  if (!box || !viewport) return;
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(2);
  expect(await style(dialog, "background-color")).toBe(WHITE);

  // La page estompée est décorative : l'éditeur reste absent tant que rien n'est choisi (T0d, critère 8).
  const faded = page.locator(".nano-page-faded");
  await expect(faded).toBeVisible();
  await expect(faded).toHaveAttribute("aria-hidden", "true");
  expect(Number(await style(faded, "opacity"))).toBeLessThan(1);
  await expect(editor(page)).toHaveCount(0);
});

test("critère 5 : le bouton « Récupérer » est le bouton principal, et la boîte se ferme après le choix", async ({
  page,
}) => {
  await showBackupQuestion(page);
  const dialog = page.getByRole("alertdialog");
  expect(await style(button(dialog, RECOVER), "background-color")).toBe(INK);
  expect(await style(button(dialog, OPEN_AS_IS), "background-color")).not.toBe(INK);
  await button(dialog, RECOVER).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(editor(page)).toHaveText("Texte du fichier ajout");
  await expect(indicator(page)).toHaveText("Non enregistré");
});

test("critère 6 : le bouton de fermeture a un aria-label", async ({ page }) => {
  await showRecoveredMessage(page);
  await expect(button(messageBox(page), CLOSE)).toHaveAttribute("aria-label", CLOSE);
  // Le bouton du groupe Fichier garde son nom : il reste seul dans la barre Fichier.
  await expect(
    button(page.getByRole("toolbar", { name: "Fichier" }), "Enregistrer sous…"),
  ).toHaveCount(1);
});

test("critère 8 : à 390 px de large, rien ne déborde horizontalement, message et boîte de dialogue compris", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await showRecoveredMessage(page);
  expect(await overflowsHorizontally(page)).toBe(false);
  const message = await messageBox(page).boundingBox();
  expect((message?.x ?? 0) + (message?.width ?? 0)).toBeLessThanOrEqual(390);

  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("Anticonstitutionnellement".repeat(8));
  await setFakeFiles(page, { nextSaveFails: true });
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("alert")).toHaveText(SAVE_ERROR);
  expect(await overflowsHorizontally(page)).toBe(false);
});

test("critère 8 : à 390 px de large, la boîte de dialogue de récupération ne déborde pas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await showBackupQuestion(page);
  expect(await overflowsHorizontally(page)).toBe(false);
  const box = await page.getByRole("alertdialog").boundingBox();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
});
