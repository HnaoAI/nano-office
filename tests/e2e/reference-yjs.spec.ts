// Tests d'interface du ticket P1, critère 7, dans Chromium : un fichier et une copie de secours faits avec
// @tiptap/y-tiptap 3.0.10 (tests/fixtures/yTiptap/) se rouvrent à l'identique dans l'éditeur, qui n'écrit rien
// dans leur état Yjs en les affichant.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import * as Y from "yjs";
import type { DocumentJson } from "../../src/core/types";
import { fakeFiles, setFakeFiles } from "./fakeFileStore";
import { button, editor, settleSelection, start, ydocJson } from "./formatHelpers";

const FIXTURES = new URL("../fixtures/yTiptap/", import.meta.url);
const REFERENCE = readFileSync(new URL("reference-3.0.10.nano", FIXTURES), "utf8");
const BACKUP = JSON.parse(readFileSync(new URL("backup-3.0.10.json", FIXTURES), "utf8")) as {
  id: string;
  updates: string[];
  content: DocumentJson;
};

/** État Yjs d'un fichier : modifications connues de chaque auteur. */
function stateVector(file: string): Uint8Array {
  const { ydoc } = JSON.parse(file) as { ydoc: string };
  return Y.encodeStateVectorFromUpdate(Uint8Array.from(Buffer.from(ydoc, "base64")));
}

test.describe("P1 : fichier et copie de secours faits avec y-tiptap 3.0.10", () => {
  test("critère 7 : le fichier de référence se rouvre à l'identique et se réenregistre sans changement", async ({
    page,
  }) => {
    await start(page);
    await setFakeFiles(page, {
      files: { "reference.nano": REFERENCE },
      nextOpen: "reference.nano",
    });
    await button(page, "Ouvrir…").click();
    await expect(page.getByRole("banner").getByText("reference", { exact: true })).toBeVisible();
    const file = JSON.parse(REFERENCE) as { content: DocumentJson };
    expect(await ydocJson(page)).toEqual(file.content);
    await expect(editor(page).locator("h1")).toHaveText("Lettre à Zoé 🌾");
    await settleSelection(page);

    await button(page, "Enregistrer").click();
    await expect.poll(async () => (await fakeFiles(page)).calls.includes("save")).toBe(true);
    const saved = (await fakeFiles(page)).files["reference.nano"] ?? "";
    expect((JSON.parse(saved) as { content: DocumentJson }).content).toEqual(file.content);
    // L'éditeur n'a rien ajouté à l'état Yjs en affichant le document : même contenu, mêmes modifications de chaque
    // auteur. Seules les notes internes de y-tiptap 3.0.10 (`__tiptap_position_migrations`), sans texte, sont vidées
    // par 3.2.0 à l'ouverture.
    expect(stateVector(saved)).toEqual(stateVector(REFERENCE));
  });

  test("critère 7 : la copie de secours de référence est restaurée à l'identique au lancement", async ({
    page,
  }) => {
    await start(page);
    await page.evaluate(
      async ({ id, updates }) => {
        // Même base que y-indexeddb : magasins « updates » (mises à jour Yjs) et « custom ».
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(`nano-office-backup:${id}`);
          request.onupgradeneeded = () => {
            request.result.createObjectStore("updates", { autoIncrement: true });
            request.result.createObjectStore("custom");
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction("updates", "readwrite");
          const store = transaction.objectStore("updates");
          for (const update of updates) {
            store.add(Uint8Array.from(atob(update), (char) => char.charCodeAt(0)));
          }
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        });
        db.close();
        localStorage.setItem("nano-office:last-modified-document", id);
      },
      { id: BACKUP.id, updates: BACKUP.updates },
    );
    await page.reload();
    await expect(editor(page)).toContainText("Ajout non enregistré, élève 😀");
    expect(await ydocJson(page)).toEqual(BACKUP.content);
  });
});
