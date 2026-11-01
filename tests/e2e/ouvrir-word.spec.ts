// Tests d'interface du ticket T2.18 (ouvrir un fichier Word), dans Chromium. Les fichiers d'exemple de
// tests/fixtures/word/ sont donnés à la fausse implémentation de FileStore, qui les lit en octets.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { flushBackups } from "./backupHelpers";
import { fakeFiles, setFakeFiles } from "./fakeFileStore";
import { button, editor, start, ydocJson } from "./formatHelpers";
import { suspiciousTraffic, watchNetwork } from "./networkWatch";

/** Ouvre un fichier d'exemple de tests/fixtures/word/ avec « Ouvrir… », sous le nom `name`. */
async function openWord(page: Page, fixture: string, name = fixture) {
  const data = readFileSync(`tests/fixtures/word/${fixture}`).toString("base64");
  const { binaryFiles } = await fakeFiles(page);
  await setFakeFiles(page, { binaryFiles: { ...binaryFiles, [name]: data }, nextOpen: name });
  await button(page, "Ouvrir…").click();
}

test("critère 1 : un fichier Word s'ouvre comme un nouveau document, nommé comme lui", async ({
  page,
}) => {
  await start(page);
  await openWord(page, "complet.docx", "Rapport.docx");
  await expect(
    editor(page).getByRole("heading", { level: 1, name: "Titre principal" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "« Rapport.docx » a été ouvert comme un nouveau document Nano Buro ; le fichier Word n'est pas modifié.",
  );
  await expect(page.locator(".nano-document-title")).toHaveText("Rapport");
  await expect(page.locator(".nano-file-name")).toHaveCount(0);
  expect((await fakeFiles(page)).current).toBeNull();
});

test("critère 1 : Ctrl/Cmd+S propose « Enregistrer sous… » en .nano et n'écrit jamais dans le .docx", async ({
  page,
}) => {
  await start(page);
  await openWord(page, "complet.docx", "Rapport.docx");
  await expect(editor(page).getByRole("heading", { level: 1 })).toBeVisible();
  const before = (await fakeFiles(page)).binaryFiles["Rapport.docx"];
  await setFakeFiles(page, { calls: [], nextSaveName: "Rapport.nano" });
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+s");
  await expect.poll(async () => (await fakeFiles(page)).files["Rapport.nano"]).toBeDefined();
  const state = await fakeFiles(page);
  expect(state.calls).toEqual(["saveAs:Rapport.nano", "picker"]);
  expect(state.binaryFiles["Rapport.docx"]).toBe(before);
  expect(JSON.parse(state.files["Rapport.nano"] ?? "{}").format).toBe("nano-office");
  // Ensuite, « Enregistrer » réécrit le fichier .nano choisi, sans rien demander.
  await setFakeFiles(page, { calls: [] });
  await page.keyboard.type("x");
  await page.keyboard.press("ControlOrMeta+s");
  await expect.poll(async () => (await fakeFiles(page)).calls).toEqual(["save"]);
});

test("critère 2 : titres, mise en forme, liste, tableau, image et saut de page sont repris", async ({
  page,
}) => {
  await start(page);
  await openWord(page, "complet.docx");
  await expect(editor(page).getByRole("heading", { level: 2, name: "Sous-titre" })).toBeVisible();
  await expect(editor(page).locator("strong", { hasText: "gras" })).toBeVisible();
  await expect(editor(page).locator("ul li", { hasText: "Puce un" })).toBeVisible();
  await expect(editor(page).locator("ol li", { hasText: "Numéro deux" })).toBeVisible();
  await expect(editor(page).locator("th", { hasText: "Nom" })).toBeVisible();
  await expect(editor(page).locator("img")).toHaveCount(1);
  await expect(editor(page).locator("a", { hasText: "le site" })).toHaveAttribute(
    "href",
    "https://example.org/",
  );
  const types = ((await ydocJson(page)).content ?? []).map((node) => node.type);
  expect(types).toContain("pageBreak");
  await expect(page.getByRole("status")).toContainText(
    "les cellules fusionnées des tableaux, séparées",
  );
});

test("critère 3 : les éléments non repris sont signalés, et le suivi des modifications est accepté", async ({
  page,
}) => {
  await start(page);
  await openWord(page, "elements-non-repris.docx");
  await expect(editor(page)).toContainText("Texte ajouté");
  await expect(editor(page)).not.toContainText("retiré");
  const status = page.getByRole("status");
  await expect(status).toContainText(
    "Certains éléments n'ont pas pu être repris : les commentaires",
  );
  await expect(status).toContainText(
    "Le suivi des modifications a été lu avec toutes les modifications acceptées.",
  );
});

for (const [fixture, text] of [
  ["protege.docx", "Ce fichier Word est protégé par un mot de passe"],
  ["ancien.doc", "Ce fichier est dans l'ancien format de Word (.doc)"],
  ["document.odt", "Ce fichier est un document OpenDocument (.odt)"],
] as const) {
  test(`critère 4 : « ${fixture} » affiche un message clair et le document en cours ne change pas`, async ({
    page,
  }) => {
    await start(page);
    await page.keyboard.type("Mon texte");
    page.on("dialog", (dialog) => void dialog.accept());
    await openWord(page, fixture);
    await expect(page.getByRole("alert")).toContainText(text);
    await expect(editor(page)).toHaveText("Mon texte");
  });
}

test("critère 4 : un fichier Word abîmé affiche un message clair, sans plantage", async ({
  page,
}) => {
  await start(page);
  await setFakeFiles(page, {
    binaryFiles: { "abime.docx": btoa("PK\u0003\u0004 pas une archive") },
    nextOpen: "abime.docx",
  });
  await button(page, "Ouvrir…").click();
  await expect(page.getByRole("alert")).toHaveText(
    "Ce fichier Word est abîmé et ne peut pas être ouvert. Il n'a pas été modifié.",
  );
  await page.keyboard.type("encore");
  await expect(editor(page)).toContainText("encore");
});

test("critère 5 : rien ne part sur le réseau pendant l'ouverture d'un fichier Word", async ({
  page,
}) => {
  const log = watchNetwork(page);
  await start(page);
  log.requests.length = 0;
  await openWord(page, "complet.docx");
  await expect(editor(page).getByRole("heading", { level: 1 })).toBeVisible();
  expect(suspiciousTraffic(log, new URL(page.url()).origin, "Titre principal")).toEqual([]);
});

test("critère 6 : la copie de secours commence dès l'ouverture", async ({ page }) => {
  await start(page);
  await openWord(page, "complet.docx");
  await expect(editor(page).getByRole("heading", { level: 1 })).toBeVisible();
  await flushBackups(page);
  await page.reload();
  await expect(
    editor(page).getByRole("heading", { level: 1, name: "Titre principal" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("récupéré depuis la copie de secours");
});
