// Outils communs aux tests du lot J (numéros de page, en-tête et pied de page, sommaire) : documents de
// plusieurs pages, ouverture depuis un fichier avec sa mise en page, boîte « Mise en page », texte des
// pages du PDF de Chromium (et leurs lignes placées, relues avec pdfjs-dist, B3) et export Word relu avec JSZip.
import zlib from "node:zlib";
import JSZip from "jszip";
import { expect, type Page } from "@playwright/test";
import { serializeDocument } from "../../src/core/fileFormat";
import { writeHeaderFooter, type HeaderFooter } from "../../src/core/headerFooter";
import type { DocumentJson } from "../../src/core/types";
import { ydocFromJson } from "../core/helpers";
import { setFakeFiles } from "./fakeFileStore";
import { button, waitEditorFocus } from "./formatHelpers";

/** Phrase d'exemple, avec accents et emoji, assez longue pour passer sur plusieurs lignes. */
export const SENTENCE =
  "Le cerf-volant de Zoé s'élève au-dessus des champs de blé, poussé par un vent d'été 🌾. ";

export function para(id: string, sentences = 3): DocumentJson {
  return {
    type: "paragraph",
    attrs: { id },
    content: [{ type: "text", text: SENTENCE.repeat(sentences).trim() }],
  };
}

export function heading(id: string, level: number, value: string): DocumentJson {
  return { type: "heading", attrs: { id, level }, content: [{ type: "text", text: value }] };
}

/** Paragraphes qui remplissent environ `pages` pages A4. */
export function pages(count: number, prefix = "p"): DocumentJson[] {
  return Array.from({ length: count * 6 }, (_, index) => para(`${prefix}-${index}`, 4));
}

/** Ouvre un document depuis un fichier, avec ses numéros, son en-tête et son pied de page éventuels. */
export async function openDocument(
  page: Page,
  content: DocumentJson[],
  headerFooter?: HeaderFooter,
  name = "expose",
) {
  const ydoc = ydocFromJson({ type: "doc", content });
  if (headerFooter) writeHeaderFooter(ydoc, headerFooter);
  const file = serializeDocument({ id: crypto.randomUUID(), ydoc });
  await setFakeFiles(page, { files: { [`${name}.nano`]: file }, nextOpen: `${name}.nano` });
  await button(page, "Ouvrir…").click();
  await expect(page.getByRole("banner").getByText(name, { exact: true })).toBeVisible();
  await waitEditorFocus(page);
}

export function pageDialog(page: Page) {
  return page.getByRole("dialog", { name: "Mise en page" });
}

/** Ouvre la boîte « Mise en page ». */
export async function openPageDialog(page: Page) {
  await button(page, "Mise en page…").click();
  await expect(pageDialog(page)).toBeVisible();
  return pageDialog(page);
}

/** Attend que les repères de page soient calculés (deux images affichées, polices chargées). */
export async function settleLayout(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

/** Nombre de pages d'un PDF, lu dans ses `/MediaBox`. */
export function pdfPageCount(pdf: Buffer): number {
  return [...pdf.toString("latin1").matchAll(/\/MediaBox\s*\[/g)].length;
}

/** Objets d'un PDF : dictionnaire et contenu du flux décompressé, par numéro d'objet. */
function pdfObjects(pdf: Buffer): Map<string, { dict: string; data: string | null }> {
  const raw = pdf.toString("latin1");
  const objects = new Map<string, { dict: string; data: string | null }>();
  for (const match of raw.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) {
    const [whole, id = "", body = ""] = match;
    const streamStart = /stream\r?\n/.exec(body);
    let data: string | null = null;
    if (streamStart) {
      const start = match.index + whole.indexOf(body) + streamStart.index + streamStart[0].length;
      const bytes = pdf.subarray(start, raw.indexOf("endstream", start));
      try {
        data = zlib.inflateSync(bytes).toString("latin1");
      } catch {
        data = bytes.toString("latin1");
      }
    }
    objects.set(id, { dict: streamStart ? body.slice(0, streamStart.index) : body, data });
  }
  return objects;
}

/** Correspondance code de glyphe → texte d'une police, lue dans sa table `ToUnicode`. */
function toUnicode(cmap: string): Map<number, string> {
  const map = new Map<number, string>();
  const decode = (hex: string) =>
    String.fromCharCode(...(hex.match(/.{4}/g) ?? []).map((unit) => parseInt(unit, 16)));
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, code = "", text = ""] of (block[1] ?? "").matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    )) {
      map.set(parseInt(code, 16), decode(text));
    }
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, low = "", high = "", base = ""] of (block[1] ?? "").matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    )) {
      for (let code = parseInt(low, 16); code <= parseInt(high, 16); code++) {
        map.set(code, String.fromCharCode(parseInt(base, 16) + code - parseInt(low, 16)));
      }
    }
  }
  return map;
}

/**
 * Texte de chaque page d'un PDF de Chromium, un bloc de texte par ligne. Chromium écrit le texte en
 * codes de glyphes ; chaque police porte une table `ToUnicode` qui les ramène au texte. Suffisant pour
 * vérifier ce que contient une page (numéro, en-tête, sommaire) ; les emojis ne sont pas relus.
 */
export function pdfPagesText(pdf: Buffer): string[] {
  const objects = pdfObjects(pdf);
  const cmaps = new Map<string, Map<number, string>>();
  const cmapOf = (fontId: string | undefined) => {
    if (!fontId) return null;
    let map = cmaps.get(fontId);
    if (!map) {
      const ref = /\/ToUnicode (\d+) 0 R/.exec(objects.get(fontId)?.dict ?? "");
      map = toUnicode(ref ? (objects.get(ref[1] ?? "")?.data ?? "") : "");
      cmaps.set(fontId, map);
    }
    return map;
  };
  const kids = /\/Kids \[([^\]]*)\]/.exec(pdf.toString("latin1"))?.[1] ?? "";
  return [...kids.matchAll(/(\d+) 0 R/g)].map(([, pageId = ""]) => {
    const dict = objects.get(pageId)?.dict ?? "";
    const fonts = new Map(
      [...(/\/Font <<([^>]*)>>/.exec(dict)?.[1] ?? "").matchAll(/\/(\w+) (\d+) 0 R/g)].map(
        ([, name = "", id = ""]) => [name, id],
      ),
    );
    const stream = objects.get(/\/Contents (\d+) 0 R/.exec(dict)?.[1] ?? "")?.data ?? "";
    let font: Map<number, string> | null = null;
    let text = "";
    for (const [, name, hex, operator] of stream.matchAll(
      /\/(\w+) [\d.]+ Tf|<([0-9A-Fa-f]*)>|\b(ET)\b/g,
    )) {
      if (name) font = cmapOf(fonts.get(name));
      else if (hex !== undefined && font) {
        for (const code of hex.match(/.{4}/g) ?? []) text += font.get(parseInt(code, 16)) ?? "";
      } else if (operator) text += "\n";
    }
    return text;
  });
}

/** Ligne de texte d'une page de PDF : son texte et sa position, en points depuis le coin bas gauche. */
export interface PdfLine {
  text: string;
  x: number;
  y: number;
}

/** Page de PDF relue par `pdfLines`. */
export interface PdfPageLines {
  width: number;
  height: number;
  lines: PdfLine[];
}

/**
 * Lignes de chaque page d'un PDF, relues avec pdfjs-dist (B3) : les morceaux de texte à la même hauteur
 * forment une ligne, de gauche à droite. Sert à vérifier où s'impriment l'en-tête, le pied de page et
 * les numéros, et combien de fois, ce que `pdfPagesText` ne dit pas.
 */
export async function pdfLines(pdf: Buffer): Promise<PdfPageLines[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: false });
  const document = await task.promise;
  const result: PdfPageLines[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const pdfPage = await document.getPage(number);
    const [, , width = 0, height = 0] = pdfPage.view;
    const rows = new Map<number, { x: number; y: number; end: number; text: string }[]>();
    for (const item of (await pdfPage.getTextContent()).items) {
      if (!("str" in item) || item.str.trim() === "") continue;
      const [, , , , x = 0, y = 0] = item.transform as number[];
      const key = Math.round(y);
      rows.set(key, [...(rows.get(key) ?? []), { x, y, end: x + item.width, text: item.str }]);
    }
    // Deux zones de marge à la même hauteur (pied de page à gauche, numéro au centre) font deux lignes.
    const lines: PdfLine[] = [];
    for (const row of rows.values()) {
      let line: (PdfLine & { end: number }) | null = null;
      for (const part of row.sort((a, b) => a.x - b.x)) {
        if (line && part.x - line.end < 12) {
          line.text += part.text;
          line.end = part.end;
        } else {
          line = { text: part.text, x: part.x, y: part.y, end: part.end };
          lines.push(line);
        }
      }
    }
    for (const line of lines) line.text = line.text.replace(/\s+/g, " ").trim();
    result.push({
      width,
      height,
      lines: lines.map(({ text, x, y }) => ({ text, x, y })).sort((a, b) => b.y - a.y),
    });
  }
  await task.destroy();
  return result;
}

/** PDF de la page, au format de sa règle `@page`. */
export async function printToPdf(page: Page): Promise<Buffer> {
  await settleLayout(page);
  return page.pdf({ preferCSSPageSize: true });
}

declare global {
  interface Window {
    __wordFiles?: { name: string; bytes: number[] }[];
  }
}

/** Remplace `showSaveFilePicker` par un faux qui garde les octets écrits (export Word). */
export async function fakeExportPicker(page: Page) {
  await page.addInitScript(() => {
    window.__wordFiles = [];
    (window as { showSaveFilePicker?: unknown }).showSaveFilePicker = async (options: {
      suggestedName: string;
    }) => ({
      name: options.suggestedName,
      createWritable: async () => {
        let chunks: number[] = [];
        return {
          write: async (data: Blob) => {
            chunks = chunks.concat(Array.from(new Uint8Array(await data.arrayBuffer())));
          },
          close: async () => {
            window.__wordFiles?.push({ name: options.suggestedName, bytes: chunks });
          },
          abort: async () => undefined,
        };
      },
    });
  });
}

/** Exporte en Word et relit l'archive écrite. */
export async function exportDocx(page: Page) {
  await button(page, "Exporter en Word…").click();
  await expect.poll(() => page.evaluate(() => window.__wordFiles?.length ?? 0)).toBeGreaterThan(0);
  const files = await page.evaluate(() => window.__wordFiles ?? []);
  const last = files[files.length - 1] as { bytes: number[] };
  const zip = await JSZip.loadAsync(Buffer.from(last.bytes));
  const text = async (path: string) => (await zip.file(path)?.async("string")) ?? "";
  const names = Object.keys(zip.files);
  return {
    text,
    document: await text("word/document.xml"),
    headers: await Promise.all(names.filter((n) => /word\/header\d+\.xml$/.test(n)).map(text)),
    footers: await Promise.all(names.filter((n) => /word\/footer\d+\.xml$/.test(n)).map(text)),
  };
}
