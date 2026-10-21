// Tests d'interface des tickets H1 (mise à jour au démarrage et numéro de version) et H2 (mise à jour
// malgré un document restauré), dans Chromium, sur le serveur de développement. Le service worker n'existe
// pas ici : ces tests vérifient le numéro « dev » et les signes de travail commencé (critère 6), lus sur
// `window.__nanoLaunch` (développement seulement), qui simule aussi une nouvelle version prête (H2).
// La publication sous /nano-office/ est vérifiée par publication.spec.ts, sur la version construite.
import { expect, test, type Dialog, type Page } from "@playwright/test";
import type { LaunchActivity } from "../../src/core/appUpdate";
import { serializeDocument } from "../../src/core/fileFormat";
import type { DocumentJson } from "../../src/core/types";
import { paragraph, ydocFromJson } from "../core/helpers";
import { flushBackups } from "./backupHelpers";
import { fakeFiles, installFakeFileStore, setFakeFiles } from "./fakeFileStore";
import { changeOnOtherComputer, relaunchWithUnsavedChanges } from "./relaunchHelpers";

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
};

const RECOVERED_MESSAGE =
  "Ce document a été récupéré depuis la copie de secours de ce navigateur. Enregistrez-le pour le garder dans un fichier.";

/** Écrit un document jamais enregistré, puis relance l'application, qui le restaure (lot B). */
async function relaunchWithDraft(page: Page, text: string) {
  await start(page);
  await editor(page).click();
  await page.keyboard.type(text);
  await flushBackups(page);
  await page.reload();
  await expect(editor(page)).toHaveText(text);
}

type MarkedWindow = { __beforeUpdate?: true };

/** Simule une nouvelle version prête (H2), après avoir marqué la page pour voir si elle se recharge. */
async function simulateUpdate(page: Page, holdControl = false) {
  await page.evaluate((hold) => {
    (window as unknown as MarkedWindow).__beforeUpdate = true;
    window.__nanoLaunch?.simulateUpdate({ holdControl: hold });
  }, holdControl);
}

/** Vrai si la page marquée par `simulateUpdate` s'est rechargée dans le délai donné. */
async function wasReloaded(page: Page, timeout = 5_000): Promise<boolean> {
  try {
    await expect
      .poll(
        () =>
          page.evaluate(() => (window as unknown as MarkedWindow).__beforeUpdate).catch(() => true),
        { timeout },
      )
      .toBeUndefined();
  } catch {
    return false;
  }
  // Hors du `try` : une page rechargée mais cassée fait échouer le test, au lieu de passer pour « pas rechargée ».
  await expect(editor(page)).toBeVisible();
  return true;
}

/**
 * Simule une nouvelle version prête (H2) et renvoie vrai si la page s'est rechargée pour l'appliquer.
 * Les alertes du navigateur affichées entre-temps (alerte avant fermeture) sont acceptées et retenues.
 */
async function updateReloads(page: Page, dialogs: string[] = []): Promise<boolean> {
  const onDialog = (dialog: Dialog) => {
    dialogs.push(dialog.type());
    void dialog.accept();
  };
  page.on("dialog", onDialog);
  try {
    await simulateUpdate(page);
    return await wasReloaded(page);
  } finally {
    page.off("dialog", onDialog);
  }
}

/** Vérifie que l'alerte avant fermeture protège toujours le document, puis la refuse et ferme la page. */
async function expectCloseAlert(page: Page, text: string) {
  const dialog = page.waitForEvent("dialog");
  // Le rechargement reste en attente de la réponse à l'alerte, refusée ici : il n'aboutit pas.
  const reload = page.reload().catch(() => undefined);
  expect((await dialog).type()).toBe("beforeunload");
  await (await dialog).dismiss();
  await expect(editor(page)).toHaveText(text);
  await page.close();
  await reload;
}

/** Ce que l'utilisateur voit au lancement : texte, titre de la fenêtre, message et son bouton. */
async function launchView(page: Page) {
  const message = page.locator(".nano-message");
  return {
    text: await editor(page).textContent(),
    title: await page.title(),
    message: await message.textContent(),
    action: await page.locator(".nano-message-action").textContent(),
  };
}

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

test("critère 6 : un export en Word en cours (sélecteur ouvert) compte comme travail commencé (T2.7)", async ({
  page,
}) => {
  // Sélecteur resté ouvert : un rechargement le ferait disparaître avec l'export.
  await page.addInitScript(() => {
    (window as { showSaveFilePicker?: unknown }).showSaveFilePicker = () => new Promise(() => {});
  });
  await start(page);
  await button(page, "Exporter en Word…").click();
  await expect.poll(() => activity(page)).toEqual({ ...NOTHING, fileAction: true });
});

test("critère 6 : la boîte « Mise en page » ouverte compte comme travail commencé (T2.5)", async ({
  page,
}) => {
  await start(page);
  await button(page, "Mise en page…").click();
  await expect(page.getByRole("dialog", { name: "Mise en page" })).toBeVisible();
  await expect.poll(() => activity(page)).toEqual({ ...NOTHING, fileAction: true });
});

test("H2, critère 1 : un document restauré n'empêche pas la mise à jour, et il est restauré à l'identique après le rechargement", async ({
  page,
}) => {
  // Remplace le test de H1 « un document restauré compte comme travail commencé » (changement autorisé, H2).
  await relaunchWithDraft(page, "Brouillon élève 😀");
  await expect(page.getByRole("status")).toHaveText(RECOVERED_MESSAGE);
  expect(await activity(page)).toEqual(NOTHING);
  const before = await launchView(page);
  // Un clic donne à la page une activation utilisateur : le navigateur afficherait alors l'alerte avant fermeture.
  await editor(page).click();
  const dialogs: string[] = [];
  expect(await updateReloads(page, dialogs)).toBe(true);
  // Critère 4 : même document, même contenu, même message ; pas d'alerte « Quitter le site ? ».
  await expect(page.getByRole("status")).toHaveText(RECOVERED_MESSAGE);
  expect(await launchView(page)).toEqual(before);
  expect(dialogs).toEqual([]);
  expect(await activity(page)).toEqual(NOTHING);
});

test("H2, critère 5 : toujours un seul rechargement au plus par lancement", async ({ page }) => {
  await relaunchWithDraft(page, "Brouillon");
  expect(await updateReloads(page)).toBe(true);
  expect(await updateReloads(page)).toBe(false);
  await expect(editor(page)).toHaveText("Brouillon");
});

test("H2, critère 2 : une frappe dans le document restauré reporte toujours la mise à jour, et l'alerte avant fermeture reste", async ({
  page,
}) => {
  await relaunchWithDraft(page, "Brouillon");
  await editor(page).press("End");
  await page.keyboard.type(" suite");
  await expect.poll(() => activity(page)).toEqual({ ...NOTHING, edited: true });
  expect(await updateReloads(page)).toBe(false);
  await expect(editor(page)).toHaveText("Brouillon suite");
  // L'alerte avant fermeture protège toujours ces modifications.
  await expectCloseAlert(page, "Brouillon suite");
});

test("H2, critère 2 : une frappe avant que la nouvelle version prenne la main annule le rechargement, et l'alerte avant fermeture reste", async ({
  page,
}) => {
  await relaunchWithDraft(page, "Brouillon");
  await simulateUpdate(page, true);
  // La décision de recharger est prise ; la nouvelle version n'a pas encore pris la main.
  await expect
    .poll(() => page.evaluate(() => typeof window.__nanoLaunch?.takeControl))
    .toBe("function");
  await editor(page).press("End");
  await page.keyboard.type(" suite");
  await page.evaluate(() => window.__nanoLaunch?.takeControl?.());
  expect(await wasReloaded(page, 2_000)).toBe(false);
  await expect(editor(page)).toHaveText("Brouillon suite");
  await expectCloseAlert(page, "Brouillon suite");
});

test("H2, critère 4 : si une autre fenêtre a modifié un autre document depuis, la mise à jour attend, pour ne pas changer de document", async ({
  page,
  context,
}) => {
  await relaunchWithDraft(page, "Brouillon X");
  // Deuxième fenêtre : elle restaure le même brouillon, puis l'abandonne pour un nouveau document.
  const other = await context.newPage();
  await installFakeFileStore(other);
  await other.goto("/");
  await expect(editor(other)).toHaveText("Brouillon X");
  other.on("dialog", (dialog) => void dialog.accept());
  await button(other, "Nouveau").click();
  await editor(other).click();
  await other.keyboard.type("Document Y");
  await flushBackups(other);
  // La première fenêtre, rechargée, rouvrirait « Document Y » : elle ne se recharge pas.
  expect(await updateReloads(page)).toBe(false);
  await expect(editor(page)).toHaveText("Brouillon X");
});

for (const [name, permission, whileClosed, action] of [
  ["le message « Enregistrer » du fichier retenu", "granted", undefined, "Enregistrer"],
  ["le message « Autoriser » du fichier retenu", "prompt", undefined, "Autoriser"],
  ["l'alerte « modifié ailleurs »", "granted", changeOnOtherComputer, "Enregistrer sous…"],
] as const) {
  test(`H2, critères 3 et 4 : ${name} n'empêche pas la mise à jour, et revient à l'identique, sans rien écrire`, async ({
    page,
  }) => {
    await relaunchWithUnsavedChanges(page, permission, whileClosed);
    await expect(page.locator(".nano-message-action")).toHaveText(action);
    expect(await activity(page)).toEqual(NOTHING);
    const before = await launchView(page);
    const { files: filesBefore, remembered } = await fakeFiles(page);
    expect(await updateReloads(page)).toBe(true);
    await expect(page.locator(".nano-message-action")).toHaveText(action);
    expect(await launchView(page)).toEqual(before);
    // Le même fichier est retenu, et rien n'y a été écrit : les modifications sont dans la copie de secours.
    // `files` couvre tout le test ; `calls`, remis à zéro au chargement, couvre la page rechargée.
    const after = await fakeFiles(page);
    expect(after.files).toEqual(filesBefore);
    expect(after.remembered).toEqual(remembered);
    expect(after.calls.filter((call) => call === "save" || call.startsWith("saveAs:"))).toEqual([]);
  });
}

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
