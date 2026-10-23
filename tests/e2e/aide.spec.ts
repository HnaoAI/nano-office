// Tests d'interface du ticket A1 : aide intégrée, dans un panneau à droite de la page, hors ligne,
// avec les raccourcis de l'ordinateur utilisé et les mêmes phrases que les messages de l'application.
import { expect, test, type Page } from "@playwright/test";
import { CORRUPTED_FILE_MESSAGE } from "../../src/core/documentFile";
import { serializeDocument } from "../../src/core/fileFormat";
import { paragraph, ydocFromJson } from "../core/helpers";
import { fakeFiles, installFakeFileStore, setFakeFiles } from "./fakeFileStore";
import { MAC_USER_AGENT, WINDOWS_USER_AGENT } from "./formatHelpers";
import { watchNetwork } from "./networkWatch";

function editor(page: Page) {
  return page.getByRole("textbox", { name: "Document" });
}

function helpButton(page: Page) {
  return page.getByRole("button", { name: "Aide", exact: true });
}

function panel(page: Page) {
  return page.getByRole("complementary", { name: "Aide" });
}

async function start(page: Page) {
  await installFakeFileStore(page);
  await page.goto("/");
  await expect(editor(page)).toBeVisible();
}

const SECTIONS = [
  "Installer Nano Buro",
  "Où ranger ses documents",
  "Ne rien perdre",
  "Les messages et quoi faire",
  "Mettre en forme",
  "Imprimer, PDF et Word",
  "Raccourcis clavier",
  "Mises à jour",
  "Confidentialité",
];

test("critère 1 : le bouton « Aide » au bout de l'en-tête ouvre le panneau à droite de la page ; le bouton de fermeture le ferme", async ({
  page,
}) => {
  await start(page);
  // Au bout de l'en-tête : le dernier bouton, après « Réglages ».
  const headerButtons = page.locator(".nano-header button");
  await expect(headerButtons.last()).toHaveAccessibleName("Aide");
  await helpButton(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(helpButton(page)).toHaveAttribute("aria-expanded", "true");
  const [panelBox, pageBox] = await Promise.all([
    panel(page).boundingBox(),
    page.locator(".nano-page").boundingBox(),
  ]);
  if (!panelBox || !pageBox) throw new Error("panneau ou page sans dimensions");
  // À droite de la page, sans la couvrir sur un écran large.
  expect(panelBox.x).toBeGreaterThanOrEqual(pageBox.x + pageBox.width - 1);
  await page.getByRole("button", { name: "Fermer l'aide" }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(helpButton(page)).toBeFocused();
});

test("critère 1 : Ctrl+/ ouvre l'aide depuis le document, Échap la ferme et rend le focus au document", async ({
  page,
}) => {
  await start(page);
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Slash");
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole("heading", { name: "Aide" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(editor(page)).toBeFocused();
  // Rien n'a été écrit dans le document.
  await expect(editor(page)).toHaveText("");
});

test("critère 1 : à petite largeur, le panneau occupe tout l'écran", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 800 });
  await start(page);
  await helpButton(page).click();
  const box = await panel(page).boundingBox();
  expect(box).toEqual({ x: 0, y: 0, width: 420, height: 800 });
});

test("critère 2 : l'aide s'affiche hors ligne, sans rien demander au réseau", async ({
  page,
  context,
}) => {
  await start(page);
  const log = watchNetwork(page, context);
  await context.setOffline(true);
  await helpButton(page).click();
  await expect(panel(page).getByRole("heading", { name: "Confidentialité" })).toBeVisible();
  await page.waitForTimeout(300);
  expect(log.requests).toEqual([]);
  await context.setOffline(false);
});

test("critère 3 : le sommaire liste les neuf sujets dans l'ordre, et un clic mène à la section", async ({
  page,
}) => {
  await start(page);
  await helpButton(page).click();
  const contents = panel(page).getByRole("navigation", { name: "Sommaire de l'aide" });
  await expect(contents.getByRole("button")).toHaveText(SECTIONS);
  await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText(SECTIONS);
  await contents.getByRole("button", { name: "Confidentialité" }).click();
  const heading = panel(page).getByRole("heading", { name: "Confidentialité" });
  await expect(heading).toBeInViewport();
  await expect(heading).toBeFocused();
});

for (const [computer, userAgent, shown, hidden] of [
  ["Mac", MAC_USER_AGENT, ["⌘S", "⌥⌘1", "⇧⌘X", "⌥⌘F", "⌘/"], ["Ctrl"]],
  ["PC", WINDOWS_USER_AGENT, ["Ctrl+S", "Ctrl+Shift+1", "Ctrl+H", "Ctrl+/"], ["⌘", "⌥"]],
] as const) {
  test.describe(computer, () => {
    test.use({ userAgent });

    test(`critère 3.7 : le tableau des raccourcis affiche les touches de l'ordinateur (${computer})`, async ({
      page,
    }) => {
      await start(page);
      await helpButton(page).click();
      const table = panel(page).locator(".nano-help-shortcuts");
      const keys = await table.locator("kbd").allTextContents();
      for (const key of shown) expect(keys).toContain(key);
      for (const symbol of hidden) expect(keys.join(" ")).not.toContain(symbol);
    });

    test(`critère 3.7 : le raccourci d'un titre affiché dans l'aide fonctionne vraiment (${computer})`, async ({
      page,
    }) => {
      await start(page);
      await helpButton(page).click();
      const row = panel(page).getByRole("row", { name: /^Titre 1/ });
      const keys = await row.locator("kbd").textContent();
      expect(keys).toBe(computer === "Mac" ? "⌥⌘1" : "Ctrl+Shift+1");
      await page.getByRole("button", { name: "Fermer l'aide" }).click();
      await editor(page).click();
      await page.keyboard.type("Chapitre");
      await page.keyboard.press(computer === "Mac" ? "Meta+Alt+Digit1" : "Control+Shift+Digit1");
      await expect(editor(page).locator("h1")).toHaveText("Chapitre");
    });
  });
}

test("critère 4 : la phrase d'un fichier abîmé est la même dans l'aide et dans l'application", async ({
  page,
}) => {
  await start(page);
  const good = serializeDocument({
    id: crypto.randomUUID(),
    ydoc: ydocFromJson({ type: "doc", content: [paragraph("p-1", { text: "Texte" })] }),
  });
  const damaged = JSON.stringify({ ...JSON.parse(good), content: "abîmé" });
  await setFakeFiles(page, { files: { "abime.nano": damaged }, nextOpen: "abime.nano" });
  await page.getByRole("button", { name: "Ouvrir…", exact: true }).click();
  const shownByApp = await page.getByRole("alert").textContent();
  expect(shownByApp).toBe(CORRUPTED_FILE_MESSAGE);
  await helpButton(page).click();
  await expect(panel(page).locator(".nano-help-shown", { hasText: shownByApp ?? "" })).toHaveText(
    shownByApp ?? "",
  );
});

test("critère 6 : l'aide ne s'imprime pas et n'est jamais enregistrée dans le document", async ({
  page,
}) => {
  await start(page);
  await editor(page).click();
  await page.keyboard.type("Mon texte");
  await helpButton(page).click();
  await page.emulateMedia({ media: "print" });
  await expect(panel(page)).toBeHidden();
  await expect(editor(page)).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await setFakeFiles(page, { nextSaveName: "lettre.nano" });
  await page.getByRole("button", { name: "Enregistrer sous…", exact: true }).click();
  await expect.poll(async () => (await fakeFiles(page)).files["lettre.nano"]).toBeTruthy();
  const saved = (await fakeFiles(page)).files["lettre.nano"];
  expect(saved).toContain("Mon texte");
  expect(saved).not.toContain("Raccourcis clavier");
  expect(saved).not.toContain("Confidentialité");
});

test("critère 7 : le numéro de version et l'adresse de l'application figurent en bas de l'aide", async ({
  page,
  baseURL,
}) => {
  await start(page);
  await helpButton(page).click();
  const footer = panel(page).locator(".nano-help-footer");
  await expect(footer).toContainText("Nano Buro dev");
  const link = footer.getByRole("link");
  await expect(link).toHaveText(`${baseURL}/`);
  await expect(link).toHaveAttribute("href", `${baseURL}/`);
});
