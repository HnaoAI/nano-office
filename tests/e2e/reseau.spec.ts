// Test d'interface du ticket T0e, critère 3 : aucune donnée de document ne part sur le réseau
// pendant l'édition, l'ouverture et l'enregistrement. Serveur de développement, avec la fausse
// implémentation de FileStore (fakeFileStore.ts). La version construite est testée dans hors-ligne.spec.ts.
import { expect, test } from "@playwright/test";
import { serializeDocument } from "../../src/core/fileFormat";
import { paragraph, ydocFromJson } from "../core/helpers";
import { fakeFiles, installFakeFileStore, setFakeFiles } from "./fakeFileStore";
import { suspiciousTraffic, watchNetwork } from "./networkWatch";

const TYPED_TEXT = "Lettre à Mamie, très privée 😀";
const FILE_TEXT = "Recette de grand-mère, à garder pour nous 🍰";

test("critère 3 : aucune donnée de document n'est envoyée sur le réseau pendant l'édition, l'ouverture et l'enregistrement", async ({
  page,
  baseURL,
}) => {
  const log = watchNetwork(page);
  await installFakeFileStore(page);
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Document" });
  const button = (name: string) => page.getByRole("button", { name, exact: true });

  // Édition, puis enregistrement.
  await editor.click();
  await page.keyboard.type(TYPED_TEXT);
  await button("Enregistrer").click();
  await expect.poll(async () => (await fakeFiles(page)).files["document.nano"]).toContain("Mamie");

  // Ouverture d'un autre fichier, modification, puis enregistrement.
  const text = serializeDocument({
    id: crypto.randomUUID(),
    ydoc: ydocFromJson({ type: "doc", content: [paragraph("p-1", { text: FILE_TEXT })] }),
  });
  await setFakeFiles(page, { files: { "recette.nano": text }, nextOpen: "recette.nano" });
  await button("Ouvrir…").click();
  await expect(editor).toContainText(FILE_TEXT);
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" Encore un secret.");
  await button("Enregistrer").click();
  await expect.poll(async () => (await fakeFiles(page)).files["recette.nano"]).toContain("secret");

  const origin = new URL(baseURL ?? page.url()).origin;
  for (const sentence of [TYPED_TEXT, FILE_TEXT, "Encore un secret"]) {
    expect(suspiciousTraffic(log, origin, sentence)).toEqual([]);
  }
});
