// Outils des tests Playwright des images (T1.9) : fabriquer une image dans le navigateur, l'insérer par
// le bouton, un dépôt ou un collage, lire les images d'un fichier enregistré.
import { expect, type Page } from "@playwright/test";
import type { NanoFileV2 } from "../../src/core/types";
import { editor } from "./formatHelpers";
import { fakeFiles } from "./fakeFileStore";

/** Description d'une image à fabriquer. */
export interface ImageSpec {
  width: number;
  height: number;
  type: "image/png" | "image/jpeg" | "image/webp";
  /** Vrai : la moitié droite est transparente. */
  transparent?: boolean;
  /** Teinte, pour obtenir deux images différentes. */
  hue?: number;
}

/** Fichier prêt pour `setInputFiles`. */
export interface ImageFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** Fabrique une image dans le navigateur (canvas), avec un dégradé pour qu'elle ressemble à une photo. */
export async function makeImage(page: Page, name: string, spec: ImageSpec): Promise<ImageFile> {
  const base64 = await page.evaluate(async ({ width, height, type, transparent, hue }) => {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas indisponible");
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `hsl(${String(hue ?? 200)} 70% 40%)`);
    gradient.addColorStop(1, `hsl(${String((hue ?? 200) + 90)} 70% 70%)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, transparent ? width / 2 : width, height);
    const blob = await canvas.convertToBlob({ type, quality: 0.95 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }, spec);
  return { name, mimeType: spec.type, buffer: Buffer.from(base64, "base64") };
}

/** Insère des fichiers avec le bouton « Insérer une image » (le sélecteur de fichiers est simulé). */
export async function insertWithButton(page: Page, files: ImageFile[]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Insérer une image", exact: true }).click();
  await (await chooser).setFiles(files);
}

/** Fichiers sérialisés pour `page.evaluate`. */
interface SerializedFile {
  name: string;
  mimeType: string;
  base64: string;
}

function serialized(files: ImageFile[]): SerializedFile[] {
  return files.map(({ name, mimeType, buffer }) => ({
    name,
    mimeType,
    base64: buffer.toString("base64"),
  }));
}

/**
 * Installe dans la page `window.__nanoTransfer`, qui construit un DataTransfer de fichiers
 * (le code passé à `page.evaluate` ne peut rien importer).
 */
async function installTransfer(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __nanoTransfer: unknown }).__nanoTransfer = (
      files: { name: string; mimeType: string; base64: string }[],
    ) => {
      const transfer = new DataTransfer();
      for (const { name, mimeType, base64 } of files) {
        const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        transfer.items.add(new File([bytes], name, { type: mimeType }));
      }
      return transfer;
    };
  });
}

type TransferWindow = { __nanoTransfer: (files: SerializedFile[]) => DataTransfer };

/** Dépose des fichiers sur l'éditeur, à droite du texte `targetText` (ou au milieu de la page). */
export async function dropFiles(page: Page, files: ImageFile[], targetText?: string) {
  const box = await (targetText ? editor(page).getByText(targetText) : editor(page)).boundingBox();
  if (!box) throw new Error("éditeur invisible");
  await installTransfer(page);
  await page.evaluate(
    ({ list, x, y }) => {
      const dataTransfer = (window as unknown as TransferWindow).__nanoTransfer(list);
      const target = document.elementFromPoint(x, y) ?? document.body;
      for (const type of ["dragenter", "dragover", "drop"]) {
        target.dispatchEvent(
          new DragEvent(type, {
            dataTransfer,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    },
    { list: serialized(files), x: box.x + box.width - 2, y: box.y + box.height / 2 },
  );
}

/** Colle des fichiers (image copiée), éventuellement avec un HTML. */
export async function pasteFiles(page: Page, files: ImageFile[], html = "") {
  await installTransfer(page);
  await page.evaluate(
    ({ list, markup }) => {
      const clipboardData = (window as unknown as TransferWindow).__nanoTransfer(list);
      if (markup) clipboardData.setData("text/html", markup);
      document
        .querySelector(".nano-editor")
        ?.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
        );
    },
    { list: serialized(files), markup: html },
  );
}

/** Images affichées dans l'éditeur, chargées. */
export function shownImages(page: Page) {
  return editor(page).locator(".nano-image img");
}

/** Attend que `count` images soient affichées et chargées. */
export async function expectImagesLoaded(page: Page, count: number) {
  await expect(shownImages(page)).toHaveCount(count);
  await expect
    .poll(() =>
      shownImages(page).evaluateAll((images) =>
        images.every((img) => (img as HTMLImageElement).naturalWidth > 0),
      ),
    )
    .toBe(true);
}

/** Fichier `.nano` enregistré, relu en JSON. */
export async function savedFile(page: Page, name = "document.nano"): Promise<NanoFileV2> {
  const text = (await fakeFiles(page)).files[name];
  if (!text) throw new Error(`fichier absent : ${name}`);
  return JSON.parse(text) as NanoFileV2;
}

/** Taille en pixels d'une image du fichier, décodée dans le navigateur. */
export async function decodedSize(
  page: Page,
  image: { type: string; data: string },
): Promise<{ width: number; height: number }> {
  return page.evaluate(async ({ type, data }) => {
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type }));
    return { width: bitmap.width, height: bitmap.height };
  }, image);
}
