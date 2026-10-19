// Tests d'interface du ticket H1 (mise à jour au démarrage et numéro de version), dans Chromium, sur le
// serveur de développement. Le service worker n'existe pas ici : ces tests vérifient le numéro « dev »
// et les signes de travail commencé (critère 6), lus sur `window.__nanoLaunch` (développement seulement).
// La publication sous /nano-office/ est vérifiée par publication.spec.ts, sur la version construite.
import { expect, test, type Page } from "@playwright/test";
import type { LaunchActivity } from "../../src/core/appUpdate";
import { serializeDocument } from "../../src/core/fileFormat";
import type { DocumentJson } from "../../src/core/types";
import { paragraph, ydocFromJson } from "../core/helpers";
import { flushBackups } from "./backupHelpers";
import { installFakeFileStore, setFakeFiles } from "./fakeFileStore";

const QUIET_TEXT = "rgb(95, 95, 92)";

function editor(page: Page) {
  return page.getByRole("textbox", { name: "Document" });
}

function button(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

function version(page: Page) {
  return page.locator(".nano-brand .nano-version");
}

/** Signes de travail commencé depuis le lancement, tels que les voit la décision de mise à jour. */
function activity(page: Page): Promise<LaunchActivity | undefined> {
  return page.evaluate(() => window.__nanoLaunch?.activity());
}

async function start(page: Page) {
  await installFakeFileStore(page);
  await page.goto("/");
  await expect(editor(page)).toBeVisible();
}

function nanoFile(text: string, id: string = crypto.randomUUID()): string {
  const json: DocumentJson = { type: "doc", content: [paragraph("p-1", { text })] };
  return serializeDocument({ id, ydoc: ydocFromJson(json) });
}

const NOTHING = {
  edited: false,
  fileAction: false,
  backupQuestion: false,
  restoredFromBackup: false,
};

test("critère 9 : la version s'affiche sous « Nano Buro », en IBM Plex Mono 12 px, couleur texte discret", async ({
  page,
}) => {
  await start(page);
  const name = page.getByRole("heading", { name: "Nano Buro" });
  const shown = version(page);
  await expect(shown).toBeVisible();
  const [nameBox, versionBox] = await Promise.all([name.boundingBox(), shown.boundingBox()]);
  expect(versionBox?.y ?? 0).toBeGreaterThanOrEqual((nameBox?.y ?? 0) + (nameBox?.height ?? 0) - 1);
  expect(Math.abs((versionBox?.x ?? 0) - (nameBox?.x ?? 0))).toBeLessThan(1);
  const css = await shown.evaluate((element) => {
    const style = getComputedStyle(element);
    return { family: style.fontFamily, size: style.fontSize, color: style.color };
  });
  expect(css.family).toContain("IBM Plex Mono");
  expect(css.size).toBe("12px");
  expect(css.color).toBe(QUIET_TEXT);
});

test("critère 11 : en développement, la version affiche « dev »", async ({ page }) => {
  await start(page);
  await expect(version(page)).toHaveText("dev");
});

test("critère 12 : la version est dans le titre survolé de l'indicateur", async ({ page }) => {
  await start(page);
  await expect(version(page)).toHaveAttribute("title", "Version de Nano Buro : dev");
});

test("critère 6 : au lancement, sans rien faire, aucun travail n'est commencé", async ({
  page,
}) => {
  await start(page);
  await editor(page).click();
  expect(await activity(page)).toEqual(NOTHING);
});

test("critère 6 : un caractère tapé compte comme travail commencé", async ({ page }) => {
  await start(page);
  await editor(page).click();
  await page.keyboard.type(" ");
  await expect.poll(() => activity(page)).toEqual({ ...NOTHING, edited: true });
});

test("critère 6 : une mise en forme appliquée, même sans texte, compte comme travail commencé", async ({
  page,
}) => {
  await start(page);
  await button(page, "Gras").click();
  await expect.poll(() => activity(page)).toEqual({ ...NOTHING, edited: true });
});

test("critère 6 : un fichier en cours d'ouverture compte comme travail commencé, même si l'ouverture est annulée", async ({
  page,
}) => {
  await start(page);
  await setFakeFiles(page, { nextOpen: null });
  await button(page, "Ouvrir…").click();
  await expect.poll(() => activity(page)).toEqual({ ...NOTHING, fileAction: true });
});

test("critère 6 : un document restauré depuis la copie de secours compte comme travail commencé", async ({
  page,
}) => {
  await start(page);
  await editor(page).click();
  await page.keyboard.type("Brouillon");
  // La copie de secours doit être écrite avant le rechargement (correction autorisée pendant U1b).
  await flushBackups(page);
  await page.reload();
  await expect(editor(page)).toContainText("Brouillon");
  await expect
    .poll(() => activity(page))
    .toEqual(expect.objectContaining({ restoredFromBackup: true }));
});

test("critère 6 : la question de la copie de secours affichée compte comme travail commencé", async ({
  page,
}) => {
  const id = crypto.randomUUID();
  await start(page);
  await setFakeFiles(page, {
    files: { "lettre.nano": nanoFile("Original", id) },
    nextOpen: "lettre.nano",
  });
  await button(page, "Ouvrir…").click();
  await editor(page).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" modifié");
  // La copie de secours doit être écrite avant le rechargement (correction autorisée pendant U1b).
  await flushBackups(page);
  // Rechargement sans question : le document restauré n'est pas le cas testé ici.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await setFakeFiles(page, {
    files: { "lettre.nano": nanoFile("Original", id) },
    nextOpen: "lettre.nano",
  });
  await button(page, "Ouvrir…").click();
  await expect(page.getByText("Ce fichier a des modifications non enregistrées")).toBeVisible();
  await expect
    .poll(() => activity(page))
    .toEqual(expect.objectContaining({ backupQuestion: true }));
});
