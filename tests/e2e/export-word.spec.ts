// Tests d'interface du ticket T2.7 (exporter en Word), dans Chromium. Le sélecteur d'enregistrement
// de Chrome est remplacé par un faux, qui garde les octets écrits ; le fichier .docx est relu avec JSZip.
import JSZip from "jszip";
import { expect, test, type Page } from "@playwright/test";
import { serializeDocument } from "../../src/core/fileFormat";
import { ydocFromJson } from "../core/helpers";
import { fakeFiles, setFakeFiles } from "./fakeFileStore";
import { button, editor, start, waitEditorFocus, ydocJson } from "./formatHelpers";
import { insertWithButton, makeImage } from "./imageHelpers";
import { suspiciousTraffic, watchNetwork } from "./networkWatch";

declare global {
  interface Window {
    __exported?: { name: string; types: unknown; bytes: number[] }[];
  }
}

/** Remplace `showSaveFilePicker` : le fichier choisi porte le nom proposé ; `cancel` simule « Annuler ». */
async function fakeExportPicker(page: Page, mode: "save" | "cancel" | "none" = "save") {
  await page.addInitScript((pickerMode) => {
    window.__exported = [];
    if (pickerMode === "none") {
      delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
      return;
    }
    (window as { showSaveFilePicker?: unknown }).showSaveFilePicker = async (options: {
      suggestedName: string;
      types: unknown;
    }) => {
      if (pickerMode === "cancel") throw new DOMException("Annulé", "AbortError");
      return {
        name: options.suggestedName,
        createWritable: async () => {
          let chunks: number[] = [];
          return {
            write: async (data: Blob) => {
              chunks = chunks.concat(Array.from(new Uint8Array(await data.arrayBuffer())));
            },
            close: async () => {
              window.__exported?.push({
                name: options.suggestedName,
                types: options.types,
                bytes: chunks,
              });
            },
            abort: async () => undefined,
          };
        },
      };
    };
  }, mode);
}

async function exported(page: Page) {
  return page.evaluate(() => window.__exported ?? []);
}

/** Archive .docx écrite par le dernier export. */
async function lastDocx(page: Page) {
  await expect.poll(async () => (await exported(page)).length).toBeGreaterThan(0);
  const files = await exported(page);
  const last = files[files.length - 1] as { bytes: number[] };
  const zip = await JSZip.loadAsync(Buffer.from(last.bytes));
  return {
    zip,
    files: Object.keys(zip.files).filter((name) => !name.endsWith("/")),
    text: async (path: string) => (await zip.file(path)?.async("string")) ?? "",
  };
}

const LETTER = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { id: "h-1", level: 1 },
      content: [{ type: "text", text: "Lettre à Zoé" }],
    },
    {
      type: "paragraph",
      attrs: { id: "p-1" },
      content: [
        {
          type: "text",
          text: "Secret de famille 😀",
          marks: [{ type: "textStyle", attrs: { fontFamily: "EB Garamond" } }, { type: "bold" }],
        },
      ],
    },
  ],
};

async function openLetter(page: Page) {
  await start(page);
  const text = serializeDocument({ id: crypto.randomUUID(), ydoc: ydocFromJson(LETTER) });
  await setFakeFiles(page, { files: { "lettre.nano": text }, nextOpen: "lettre.nano" });
  await button(page, "Ouvrir…").click();
  await expect(editor(page)).toContainText("Lettre à Zoé");
  await waitEditorFocus(page);
  return text;
}

function exportButton(page: Page) {
  return page
    .getByRole("toolbar", { name: "Fichier" })
    .getByRole("button", { name: "Exporter en Word…" });
}

test("critère 1 : « Exporter en Word… » propose <nom du document>.docx ; le .nano n'est pas modifié et reste le fichier courant", async ({
  page,
}) => {
  await fakeExportPicker(page);
  const original = await openLetter(page);
  const callsBefore = (await fakeFiles(page)).calls.length;
  const before = await ydocJson(page);
  await exportButton(page).click();
  await expect(page.getByRole("status")).toHaveText(
    "Le fichier Word « lettre.docx » a été créé. Votre document reste « lettre.nano ».",
  );
  const [file] = await exported(page);
  expect(file?.name).toBe("lettre.docx");
  expect(JSON.stringify(file?.types)).toContain(".docx");
  // Le fichier .nano n'est pas touché, le document non plus.
  expect((await fakeFiles(page)).files["lettre.nano"]).toBe(original);
  expect((await fakeFiles(page)).calls.length).toBe(callsBefore);
  expect(await ydocJson(page)).toEqual(before);
  await expect(page).toHaveTitle("lettre.nano - Nano Buro");
  // Ctrl/Cmd+S écrit toujours dans le .nano, jamais dans le .docx.
  await page.keyboard.press("End");
  await page.keyboard.type(" Suite.");
  await page.keyboard.press("ControlOrMeta+s");
  await expect.poll(async () => (await fakeFiles(page)).files["lettre.nano"]).toContain("Suite.");
  expect(await exported(page)).toHaveLength(1);
});

test("critère 1 : un document jamais enregistré propose « Sans titre.docx »", async ({ page }) => {
  await fakeExportPicker(page);
  await start(page);
  await page.keyboard.type("Brouillon");
  await exportButton(page).click();
  await expect.poll(async () => (await exported(page))[0]?.name).toBe("Sans titre.docx");
  await expect(page.getByRole("status")).toContainText("Votre document n'est pas modifié.");
});

test("critère 1 : sans sélecteur (Safari, Firefox), le fichier Word est téléchargé", async ({
  page,
}) => {
  await fakeExportPicker(page, "none");
  await openLetter(page);
  const download = page.waitForEvent("download");
  await exportButton(page).click();
  expect((await download).suggestedFilename()).toBe("lettre.docx");
  await expect(page.getByRole("status")).toContainText("téléchargé");
});

test("critère 1 : fermer le sélecteur n'exporte rien et n'affiche aucun message", async ({
  page,
}) => {
  await fakeExportPicker(page, "cancel");
  await openLetter(page);
  await exportButton(page).click();
  await page.waitForTimeout(500);
  expect(await exported(page)).toEqual([]);
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("relecture : le message de l'export ne cache pas une alerte déjà affichée", async ({
  page,
}) => {
  await fakeExportPicker(page);
  await openLetter(page);
  await insertWithButton(page, [
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("pas une image") },
  ]);
  await expect(page.getByRole("alert")).toContainText("n'est pas une image");
  await exportButton(page).click();
  await lastDocx(page);
  await page.waitForTimeout(300);
  await expect(page.getByRole("alert")).toContainText("n'est pas une image");
});

test("critère 1 : un nom tapé qui n'est pas un .docx est refusé, et le fichier visé n'est pas touché", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as { showSaveFilePicker?: unknown }).showSaveFilePicker = async () => ({
      name: "lettre.nano",
      createWritable: async () => {
        (window as { __written?: boolean }).__written = true;
        throw new Error("ne doit pas être appelé");
      },
    });
  });
  const original = await openLetter(page);
  await exportButton(page).click();
  await expect(page.getByRole("alert")).toContainText(
    "« lettre.nano » n'est pas un fichier Word : rien n'a été écrit.",
  );
  expect(await page.evaluate(() => (window as { __written?: boolean }).__written)).toBeUndefined();
  expect((await fakeFiles(page)).files["lettre.nano"]).toBe(original);
});

test("critère 3 et 4 : titres, mise en forme, images et polices embarquées dans le .docx", async ({
  page,
}) => {
  await fakeExportPicker(page);
  await openLetter(page);
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await insertWithButton(page, [
    await makeImage(page, "photo.webp", { width: 800, height: 400, type: "image/webp" }),
  ]);
  await expect(page.locator(".nano-editor img")).toHaveCount(1);
  await exportButton(page).click();
  const docx = await lastDocx(page);
  const body = await docx.text("word/document.xml");
  expect(body).toContain('<w:pStyle w:val="Heading1"/>');
  expect(body).toContain("Lettre à Zoé");
  expect(body).toContain("Secret de famille 😀");
  expect(body).toMatch(/<w:rFonts w:ascii="EB Garamond"/);
  // L'image WebP est convertie en PNG, que Word sait lire.
  const media = docx.files.filter((name) => name.startsWith("word/media/"));
  expect(media).toHaveLength(1);
  expect(media[0]).toMatch(/\.png$/);
  // IBM Plex Sans (police par défaut) et EB Garamond, chacune en quatre styles.
  const fonts = docx.files.filter((name) => name.startsWith("word/fonts/"));
  expect(fonts).toHaveLength(8);
  const fontTable = await docx.text("word/fontTable.xml");
  expect(fontTable).toContain('w:name="IBM Plex Sans"');
  expect(fontTable).toContain('w:name="EB Garamond"');
});

test("critère 3 : la mise en page du document (T2.5) est reprise", async ({ page }) => {
  await fakeExportPicker(page);
  await openLetter(page);
  await button(page, "Mise en page…").click();
  await page.getByRole("radio", { name: "Paysage" }).check();
  await page.getByRole("radio", { name: /^Étroites/ }).check();
  await page.getByRole("button", { name: "Appliquer" }).click();
  await exportButton(page).click();
  const body = await (await lastDocx(page)).text("word/document.xml");
  expect(body).toMatch(/<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/);
  expect(body).toMatch(/<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/);
});

test("critère 6 : rien ne part sur le réseau pendant l'export", async ({ page, baseURL }) => {
  await fakeExportPicker(page);
  const log = watchNetwork(page);
  await openLetter(page);
  await exportButton(page).click();
  await lastDocx(page);
  const origin = new URL(baseURL ?? page.url()).origin;
  expect(suspiciousTraffic(log, origin, "Secret de famille")).toEqual([]);
  expect(log.requests.filter(({ url }) => new URL(url).origin !== origin)).toEqual([]);
});

test("critère 5 : un document vide s'exporte sans erreur", async ({ page }) => {
  await fakeExportPicker(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page);
  await exportButton(page).click();
  const body = await (await lastDocx(page)).text("word/document.xml");
  expect(body).toContain("<w:body>");
  expect(errors).toEqual([]);
});
