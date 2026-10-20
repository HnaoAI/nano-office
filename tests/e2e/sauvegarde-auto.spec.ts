// Tests d'interface du ticket T1.6 (sauvegarde automatique dans le fichier), dans Chromium.
// Les fichiers passent par la fausse implémentation de FileStore (fakeFileStore.ts), en temps réel :
// les délais exacts (3 et 30 secondes) sont vérifiés par tests/core/autoSave.test.ts, avec une horloge simulée.
import { expect, test, type Page } from "@playwright/test";
import { serializeDocument } from "../../src/core/fileFormat";
import { paragraph, ydocFromJson } from "../core/helpers";
import { fakeFiles, installFakeFileStore, releaseWrites, setFakeFiles } from "./fakeFileStore";

const SAVE_ERROR =
  "Le document n'a pas pu être enregistré. Réessayez, ou choisissez un autre emplacement avec « Enregistrer sous… ».";
/** Délai de la sauvegarde automatique, avec une marge pour le navigateur. */
const AFTER_AUTO_SAVE = 3_000 + 2_000;

function editor(page: Page) {
  return page.getByRole("textbox", { name: "Document" });
}

function button(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

function indicator(page: Page) {
  return page.getByRole("banner").locator(".nano-save-state");
}

/**
 * Nombre d'enregistrements demandés à la fausse implémentation. Un `save` sans fichier courant appelle
 * lui-même `saveAs` : ce `saveAs` ne compte pas une deuxième fois.
 */
async function saveCalls(page: Page): Promise<number> {
  const { calls } = await fakeFiles(page);
  return calls.filter(
    (call, index) => call === "save" || (call.startsWith("saveAs:") && calls[index - 1] !== "save"),
  ).length;
}

async function start(page: Page, mode?: "download") {
  await installFakeFileStore(page, mode);
  await page.goto("/");
  await editor(page).click();
}

/** Démarre avec un document déjà enregistré une fois dans « lettre.nano ». */
async function startWithFile(page: Page) {
  await start(page);
  await setFakeFiles(page, { nextSaveName: "lettre.nano" });
  await page.keyboard.type("Début");
  await button(page, "Enregistrer").click();
  await expect(page).toHaveTitle("lettre.nano - Nano Buro");
  await expect(indicator(page)).toHaveText("Enregistré");
}

test("critère 1 : un document qui a un fichier s'enregistre tout seul quelques secondes après la dernière frappe", async ({
  page,
}) => {
  await startWithFile(page);
  await page.keyboard.type(" puis la suite, élève 😀");
  await expect(indicator(page)).toHaveText("Non enregistré");
  await expect
    .poll(async () => (await fakeFiles(page)).files["lettre.nano"], { timeout: AFTER_AUTO_SAVE })
    .toContain("Début puis la suite, élève 😀");
  await expect(indicator(page)).toHaveText("Enregistré");
  await expect(page).toHaveTitle("lettre.nano - Nano Buro");
  // Réécrit le même fichier, sans sélecteur.
  const { calls } = await fakeFiles(page);
  expect(calls.filter((call) => call === "picker")).toHaveLength(1);
});

test("critère 1 : rien n'est enregistré avant 3 secondes de calme", async ({ page }) => {
  await startWithFile(page);
  const before = await saveCalls(page);
  await page.keyboard.type(" suite");
  await page.waitForTimeout(2_000);
  expect(await saveCalls(page)).toBe(before);
});

test("critère 3 : l'indicateur affiche « Enregistrement… » pendant la sauvegarde automatique, puis « Enregistré »", async ({
  page,
}) => {
  await startWithFile(page);
  await setFakeFiles(page, { holdWrites: true });
  await page.keyboard.type(" suite");
  await expect(indicator(page)).toHaveText("Enregistrement…", { timeout: AFTER_AUTO_SAVE });
  await releaseWrites(page);
  await expect(indicator(page)).toHaveText("Enregistré");
  // Aucun nouvel élément d'interface : pas de message après une sauvegarde automatique réussie.
  await expect(page.locator(".nano-message")).toHaveCount(0);
});

test("critère 4 : un document jamais enregistré n'est pas enregistré automatiquement", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Jamais enregistré");
  await page.waitForTimeout(AFTER_AUTO_SAVE);
  expect(await saveCalls(page)).toBe(0);
  await expect(indicator(page)).toHaveText("Non enregistré");
  await expect(button(page, "Enregistrer")).toBeVisible();
});

test("critère 5 : un échec affiche le message existant, garde la copie de secours et ne réessaie pas en boucle", async ({
  page,
}) => {
  await startWithFile(page);
  await setFakeFiles(page, { nextSaveFails: true });
  await page.keyboard.type(" perdu ?");
  const alert = page.getByRole("alert");
  await expect(alert).toHaveText(SAVE_ERROR, { timeout: AFTER_AUTO_SAVE });
  await expect(page.locator(".nano-message-action")).toHaveText("Enregistrer sous…");
  const afterFailure = await saveCalls(page);

  // De nouvelles frappes ne relancent pas d'écriture tant qu'aucun enregistrement n'a réussi.
  await page.keyboard.type(" encore");
  await page.waitForTimeout(AFTER_AUTO_SAVE);
  expect(await saveCalls(page)).toBe(afterFailure);
  await expect(indicator(page)).toHaveText("Non enregistré");
  await expect(page.getByText("Copie de secours à jour")).toBeVisible();

  // Un enregistrement réussi relance la sauvegarde automatique.
  await button(page, "Enregistrer").click();
  await expect(indicator(page)).toHaveText("Enregistré");
  await page.keyboard.type(" reprise");
  await expect
    .poll(async () => (await fakeFiles(page)).files["lettre.nano"], { timeout: AFTER_AUTO_SAVE })
    .toContain("reprise");
});

test("critère 6 : Ctrl/Cmd+S pendant une sauvegarde automatique n'écrit pas en même temps", async ({
  page,
}) => {
  await startWithFile(page);
  await setFakeFiles(page, { holdWrites: true });
  const before = await saveCalls(page);
  await page.keyboard.type(" suite");
  await expect(indicator(page)).toHaveText("Enregistrement…", { timeout: AFTER_AUTO_SAVE });
  await page.keyboard.press("ControlOrMeta+s");
  await button(page, "Enregistrer").click();
  expect(await saveCalls(page)).toBe(before + 1);
  await setFakeFiles(page, { holdWrites: false });
  await releaseWrites(page);
  await expect(indicator(page)).toHaveText("Enregistré");
  expect(await saveCalls(page)).toBe(before + 1);
});

test("critère 7 : sans l'API File System Access (Safari, Firefox), pas d'enregistrement automatique", async ({
  page,
}) => {
  await start(page, "download");
  await page.keyboard.type("Téléchargé");
  await button(page, "Enregistrer").click();
  await expect(page.getByRole("status")).toContainText("utilisez Chrome ou Edge");
  await page.keyboard.type(" puis modifié");
  await page.waitForTimeout(AFTER_AUTO_SAVE);
  expect(await saveCalls(page)).toBe(1);
  await expect(indicator(page)).toHaveText("Non enregistré");
  await expect(page.getByText("Copie de secours à jour")).toBeVisible();
});

test("critère 9 : après une sauvegarde automatique, fermer l'onglet ne déclenche pas d'alerte", async ({
  page,
}) => {
  await startWithFile(page);
  await page.keyboard.type(" suite");
  await expect
    .poll(async () => (await fakeFiles(page)).files["lettre.nano"], { timeout: AFTER_AUTO_SAVE })
    .toContain("Début suite");
  await expect(indicator(page)).toHaveText("Enregistré");
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.type());
    void dialog.accept();
  });
  await page.close({ runBeforeUnload: true });
  expect(dialogs).toEqual([]);
});

test("critère 10 : une sauvegarde automatique compte comme travail commencé pour la mise à jour", async ({
  page,
}) => {
  await startWithFile(page);
  await page.keyboard.type(" suite");
  await expect
    .poll(async () => (await fakeFiles(page)).files["lettre.nano"], { timeout: AFTER_AUTO_SAVE })
    .toContain("Début suite");
  const activity = await page.evaluate(() => window.__nanoLaunch?.activity());
  expect(activity?.fileAction).toBe(true);
});

test("ouvrir un autre fichier juste après une frappe n'écrit jamais l'ancien document dans le nouveau fichier", async ({
  page,
}) => {
  await startWithFile(page);
  const other = serializeDocument({
    id: crypto.randomUUID(),
    ydoc: ydocFromJson({ type: "doc", content: [paragraph("p-1", { text: "Autre fichier" })] }),
  });
  page.on("dialog", (dialog) => void dialog.accept().catch(() => undefined));
  await page.keyboard.type(" à abandonner");
  const { files } = await fakeFiles(page);
  await setFakeFiles(page, { files: { ...files, "autre.nano": other }, nextOpen: "autre.nano" });
  await button(page, "Ouvrir…").click();
  await expect(page).toHaveTitle("autre.nano - Nano Buro");
  await page.waitForTimeout(AFTER_AUTO_SAVE);
  const after = await fakeFiles(page);
  expect(after.files["autre.nano"]).toBe(other);
  expect(after.files["lettre.nano"]).not.toContain("à abandonner");
});

test("« Ouvrir » pendant un enregistrement ne fait rien : le document ouvert ne peut pas s'écrire dans l'ancien fichier", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Premier");
  await setFakeFiles(page, { holdWrites: true, nextSaveName: "premier.nano", nextOpen: null });
  await button(page, "Enregistrer").click();
  await expect(indicator(page)).toHaveText("Enregistrement…");
  await button(page, "Ouvrir…").click();
  await button(page, "Nouveau").click();
  expect((await fakeFiles(page)).calls).not.toContain("open");
  expect((await fakeFiles(page)).calls).not.toContain("forget");
  await releaseWrites(page);
  await expect(page).toHaveTitle("premier.nano - Nano Buro");
});

test("pendant la question de la copie de secours, l'ancien document ne s'écrit pas dans le fichier ouvert", async ({
  page,
}) => {
  page.on("dialog", (dialog) => void dialog.accept().catch(() => undefined));
  await start(page);
  // Le fichier B a une copie de secours différente : ses modifications n'ont pas pu être enregistrées.
  const fileB = serializeDocument({
    id: crypto.randomUUID(),
    ydoc: ydocFromJson({ type: "doc", content: [paragraph("p-1", { text: "Fichier B" })] }),
  });
  await setFakeFiles(page, { files: { "b.nano": fileB }, nextOpen: "b.nano", nextSaveFails: true });
  await button(page, "Ouvrir…").click();
  await expect(page).toHaveTitle("b.nano - Nano Buro");
  await editor(page).press("End");
  await page.keyboard.type(" modifié");
  await expect(page.getByRole("alert")).toBeVisible({ timeout: AFTER_AUTO_SAVE });

  // Document A, avec son fichier, modifié juste avant de rouvrir B.
  await button(page, "Nouveau").click();
  await editor(page).click();
  await setFakeFiles(page, { nextSaveName: "a.nano" });
  await page.keyboard.type("Document A");
  await button(page, "Enregistrer").click();
  await expect(page).toHaveTitle("a.nano - Nano Buro");
  await page.keyboard.type(" modifié");
  await setFakeFiles(page, { nextOpen: "b.nano" });
  await button(page, "Ouvrir…").click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.waitForTimeout(AFTER_AUTO_SAVE);
  expect((await fakeFiles(page)).files["b.nano"]).toBe(fileB);
});
