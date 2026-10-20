// Tests d'interface du ticket PL3 (se souvenir du fichier au redémarrage), dans Chromium.
// La fausse implémentation de FileStore garde ses fichiers et ses fichiers retenus au rechargement
// (`keepAcrossReloads`) ; la copie de secours utilise le vrai IndexedDB.
import { expect, test, type Page } from "@playwright/test";
import { serializeDocument } from "../../src/core/fileFormat";
import type { DocumentJson } from "../../src/core/types";
import { paragraph, ydocFromJson } from "../core/helpers";
import { flushBackups } from "./backupHelpers";
import { fakeFiles, installFakeFileStore, setFakeFiles } from "./fakeFileStore";

const RECOVERED = "Ce document a été récupéré depuis la copie de secours de ce navigateur.";
const RECOVERED_MESSAGE = `${RECOVERED} Enregistrez-le pour le garder dans un fichier.`;
const READY_MESSAGE = `${RECOVERED} Enregistrez-le pour mettre à jour le fichier « lettre.nano ».`;
const PERMISSION_MESSAGE = `${RECOVERED} Pour l'enregistrer de nouveau dans « lettre.nano », autorisez Nano Buro à modifier ce fichier.`;
const SAVE_ERROR =
  "Le document n'a pas pu être enregistré. Réessayez, ou choisissez un autre emplacement avec « Enregistrer sous… ».";
const CONFLICT_MESSAGE =
  "Le fichier « lettre.nano » a été modifié en dehors de Nano Buro depuis le dernier enregistrement. Pour ne pas l'écraser, enregistrez ce document ailleurs avec « Enregistrer sous… ».";
/** Délai de la sauvegarde automatique (T1.6), avec une marge. */
const AFTER_AUTO_SAVE = 3_000 + 2_000;

function editor(page: Page) {
  return page.getByRole("textbox", { name: "Document" });
}

function indicator(page: Page) {
  return page.getByRole("banner").locator(".nano-save-state");
}

/** Bouton d'action du message affiché. */
function messageAction(page: Page) {
  return page.locator(".nano-message-action");
}

/** Écritures demandées à la fausse implémentation depuis le dernier `clearCalls`. */
async function writes(page: Page): Promise<string[]> {
  const { calls } = await fakeFiles(page);
  return calls.filter((call) => call === "save" || call.startsWith("saveAs:"));
}

/**
 * Premier lancement : le document est enregistré dans « lettre.nano », puis modifié sans que la
 * modification atteigne le fichier (écriture retenue), et l'application est relancée.
 */
async function relaunchWithUnsavedChanges(page: Page, permission: "granted" | "prompt") {
  await installFakeFileStore(page, "file-system-access", { keepAcrossReloads: true });
  await page.goto("/");
  await editor(page).click();
  await setFakeFiles(page, { nextSaveName: "lettre.nano", restorePermission: permission });
  await page.keyboard.type("Début");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(indicator(page)).toHaveText("Enregistré");
  await setFakeFiles(page, { holdWrites: true });
  await page.keyboard.type(" puis la suite, élève 😀");
  await flushBackups(page);
  await page.reload();
  await expect(editor(page)).toHaveText("Début puis la suite, élève 😀");
}

test("critère 1 : après un redémarrage, le document s'enregistre dans le même fichier, sans « Enregistrer sous »", async ({
  page,
}) => {
  await relaunchWithUnsavedChanges(page, "granted");
  await expect(page.getByRole("status")).toHaveText(READY_MESSAGE);
  await expect(page).toHaveTitle("• lettre.nano - Nano Buro");
  await expect(indicator(page)).toHaveText("Non enregistré");

  await messageAction(page).click();
  await expect(indicator(page)).toHaveText("Enregistré");
  const state = await fakeFiles(page);
  expect(state.calls).toEqual(["save"]);
  expect(state.files["lettre.nano"]).toContain("Début puis la suite, élève 😀");

  // La sauvegarde automatique reprend dans le même fichier.
  await editor(page).press("End");
  await page.keyboard.type(" et la fin");
  await expect
    .poll(async () => (await fakeFiles(page)).files["lettre.nano"], { timeout: AFTER_AUTO_SAVE })
    .toContain("et la fin");
  expect((await fakeFiles(page)).calls).not.toContain("picker");
});

test("critère 1 : Ctrl/Cmd+S après un redémarrage réécrit aussi le même fichier", async ({
  page,
}) => {
  await relaunchWithUnsavedChanges(page, "granted");
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+s");
  await expect(indicator(page)).toHaveText("Enregistré");
  expect(await writes(page)).toEqual(["save"]);
  expect((await fakeFiles(page)).calls).not.toContain("picker");
});

test("critère 2 : si l'autorisation d'écrire doit être redonnée, le message la propose en un clic", async ({
  page,
}) => {
  await relaunchWithUnsavedChanges(page, "prompt");
  await expect(page.getByRole("status")).toHaveText(PERMISSION_MESSAGE);
  await expect(messageAction(page)).toHaveText("Autoriser");

  await messageAction(page).click();
  await expect(indicator(page)).toHaveText("Enregistré");
  const state = await fakeFiles(page);
  expect(state.calls).toEqual(["save", "requestPermission:lettre.nano"]);
  expect(state.files["lettre.nano"]).toContain("Début puis la suite, élève 😀");
  await expect(page.locator(".nano-message")).toHaveCount(0);
});

test("critère 2 : tant que l'autorisation n'est pas redonnée, rien n'est écrit et la copie de secours protège les modifications", async ({
  page,
}) => {
  await relaunchWithUnsavedChanges(page, "prompt");
  await editor(page).press("End");
  await page.keyboard.type(" encore");
  await page.waitForTimeout(AFTER_AUTO_SAVE);
  expect(await writes(page)).toEqual([]);
  expect((await fakeFiles(page)).files["lettre.nano"]).not.toContain("la suite");
  await expect(indicator(page)).toHaveText("Non enregistré");
  await expect(page.getByText("Copie de secours à jour")).toBeVisible();
});

test("critère 3 : si le fichier a été déplacé ou supprimé, le message d'échec propose « Enregistrer sous… »", async ({
  page,
}) => {
  await relaunchWithUnsavedChanges(page, "granted");
  await setFakeFiles(page, { nextSaveFails: true });
  await messageAction(page).click();
  await expect(page.getByRole("alert")).toHaveText(SAVE_ERROR);
  await expect(messageAction(page)).toHaveText("Enregistrer sous…");
  await setFakeFiles(page, { nextSaveName: "ailleurs.nano" });
  await messageAction(page).click();
  await expect(page).toHaveTitle("ailleurs.nano - Nano Buro");
  expect((await fakeFiles(page)).files["ailleurs.nano"]).toContain("la suite");
});

test("critère 4 : au redémarrage, le fichier n'est jamais réécrit avant que l'utilisateur ait vu son nom et enregistré", async ({
  page,
}) => {
  await relaunchWithUnsavedChanges(page, "granted");
  await expect(page.getByRole("banner")).toContainText("lettre");
  await expect(page.getByRole("status")).toContainText("« lettre.nano »");
  // Même après une frappe, la sauvegarde automatique attend le premier enregistrement choisi par l'utilisateur.
  await editor(page).press("End");
  await page.keyboard.type(" encore");
  await page.waitForTimeout(AFTER_AUTO_SAVE);
  expect(await writes(page)).toEqual([]);
});

test("critère 4 : un fichier modifié ailleurs pendant la fermeture n'est pas écrasé par la copie de secours", async ({
  page,
}) => {
  await relaunchWithUnsavedChanges(page, "granted");
  await setFakeFiles(page, { restoredChangedOnDisk: true });
  const before = (await fakeFiles(page)).files["lettre.nano"];
  await messageAction(page).click();
  await expect(page.getByRole("alert")).toHaveText(CONFLICT_MESSAGE);
  await expect(messageAction(page)).toHaveText("Enregistrer sous…");
  expect((await fakeFiles(page)).files["lettre.nano"]).toBe(before);
  await expect(indicator(page)).toHaveText("Non enregistré");
  // La sauvegarde automatique ne réessaie pas non plus.
  await editor(page).press("End");
  await page.keyboard.type(" encore");
  await page.waitForTimeout(AFTER_AUTO_SAVE);
  expect((await fakeFiles(page)).files["lettre.nano"]).toBe(before);
});

test("un document jamais enregistré revient sans fichier, comme avant", async ({ page }) => {
  await installFakeFileStore(page, "file-system-access", { keepAcrossReloads: true });
  await page.goto("/");
  await editor(page).click();
  await page.keyboard.type("Brouillon");
  await flushBackups(page);
  await page.reload();
  await expect(page.getByRole("status")).toHaveText(RECOVERED_MESSAGE);
  await expect(page).toHaveTitle("• Sans titre - Nano Buro");
});

test("« Ouvrir » retient aussi le fichier ouvert, sous l'id du document", async ({ page }) => {
  await installFakeFileStore(page);
  await page.goto("/");
  const id = crypto.randomUUID();
  const json: DocumentJson = { type: "doc", content: [paragraph("p-1", { text: "Ouvert" })] };
  const text = serializeDocument({ id, ydoc: ydocFromJson(json) });
  await setFakeFiles(page, { files: { "ouvert.nano": text }, nextOpen: "ouvert.nano" });
  await page.getByRole("button", { name: "Ouvrir…", exact: true }).click();
  await expect(page).toHaveTitle("ouvert.nano - Nano Buro");
  expect((await fakeFiles(page)).remembered).toEqual({ [id]: "ouvert.nano" });
});

test("la mémoire des fichiers garde une poignée sous l'id du document, après un rechargement", async ({
  page,
}) => {
  await page.goto("/");
  await expect(editor(page)).toBeVisible();
  // Un objet ordinaire tient lieu de poignée : IndexedDB le garde de la même façon.
  await page.evaluate(async () => {
    const path = "/src/storage/fileHandleMemory.ts";
    const { createFileHandleMemory } = (await import(
      /* @vite-ignore */ path
    )) as typeof import("../../src/storage/fileHandleMemory");
    const file = { handle: { name: "lettre.nano" }, lastModified: 42 } as unknown as Parameters<
      NonNullable<ReturnType<typeof createFileHandleMemory>>["remember"]
    >[1];
    await createFileHandleMemory()?.remember("id-a", file);
  });
  await page.reload();
  const recalled = await page.evaluate(async () => {
    const path = "/src/storage/fileHandleMemory.ts";
    const { createFileHandleMemory } = (await import(
      /* @vite-ignore */ path
    )) as typeof import("../../src/storage/fileHandleMemory");
    const memory = createFileHandleMemory();
    return {
      a: await memory?.recall("id-a"),
      b: await memory?.recall("id-b"),
    };
  });
  expect(recalled).toEqual({ a: { handle: { name: "lettre.nano" }, lastModified: 42 }, b: null });
});
