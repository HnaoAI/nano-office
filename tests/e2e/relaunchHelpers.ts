// Aides des tests Playwright qui relancent l'application avec un document restauré et son fichier
// retrouvé (PL3), partagées avec les tests de mise à jour (H2). Déplacées depuis fichier-retenu.spec.ts.
import { expect, type Page } from "@playwright/test";
import { flushBackups } from "./backupHelpers";
import { fakeFiles, installFakeFileStore, setFakeFiles } from "./fakeFileStore";

/**
 * Premier lancement : le document est enregistré dans « lettre.nano », puis modifié sans que la
 * modification atteigne le fichier (écriture retenue), et l'application est relancée.
 * @param permission autorisation d'écrire du fichier retrouvé au lancement
 * @param whileClosed ce qui se passe pendant la fermeture, par exemple sur l'autre ordinateur
 */
export async function relaunchWithUnsavedChanges(
  page: Page,
  permission: "granted" | "prompt",
  whileClosed?: (page: Page) => Promise<void>,
) {
  const editor = page.getByRole("textbox", { name: "Document" });
  await installFakeFileStore(page, "file-system-access", { keepAcrossReloads: true });
  await page.goto("/");
  await editor.click();
  await setFakeFiles(page, { nextSaveName: "lettre.nano", restorePermission: permission });
  await page.keyboard.type("Début");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("banner").locator(".nano-save-state")).toHaveText("Enregistré");
  await setFakeFiles(page, { holdWrites: true });
  await page.keyboard.type(" puis la suite, élève 😀");
  await flushBackups(page);
  await whileClosed?.(page);
  await page.reload();
  await expect(editor).toHaveText("Début puis la suite, élève 😀");
}

/** Mardi, sur le PC : la même lettre est modifiée et enregistrée, puis synchronisée, pendant que le Mac est fermé. */
export async function changeOnOtherComputer(page: Page) {
  const { files } = await fakeFiles(page);
  await setFakeFiles(page, {
    files: { ...files, "lettre.nano": "version de mardi" },
    changedSinceLastLaunch: true,
  });
}
