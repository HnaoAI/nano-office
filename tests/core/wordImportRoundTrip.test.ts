// @vitest-environment jsdom
// Ouverture d'un fichier Word (T2.18) : aller-retour Nano Buro, Word, Nano Buro (note technique du ticket). Un
// document qui utilise toute la mise en forme de Nano Buro est exporté en Word (T2.7), puis rouvert : tout est
// gardé, sauf les identifiants de bloc, neufs (critère 6). Le XML est analysé par le DOMParser de jsdom.
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contentOf } from "../../src/core/fileFormat";
import {
  headerFooterAttrs,
  writeHeaderFooter,
  type HeaderFooter,
} from "../../src/core/headerFooter";
import { imageHash, type StoredImage } from "../../src/core/images";
import { pageSetupAttrs, writePageSetup, type PageSetup } from "../../src/core/pageSetup";
import type { DocumentJson } from "../../src/core/types";
import { exportWord } from "../../src/core/wordExport";
import { readWordFile, wordDocument } from "../../src/core/wordImport";
import { ydocFromJson } from "./helpers";
import { fakePng } from "./imageHelpers";

const parser = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");

/** Fichier Word exporté par Nano Buro, rangé dans tests/fixtures/ (refait avec `UPDATE_WORD_FIXTURES=1`). */
const FIXTURE = "tests/fixtures/word/export-nano-buro.docx";

const image: StoredImage = fakePng(7, 200);
const hash = imageHash(image.data);

function text(value: string, marks?: DocumentJson["marks"]): DocumentJson {
  return { type: "text", text: value, ...(marks ? { marks } : {}) };
}
function para(content: DocumentJson[], attrs: Record<string, unknown> = {}): DocumentJson {
  return { type: "paragraph", attrs: { id: null, ...attrs }, content };
}
function item(...content: DocumentJson[]): DocumentJson {
  return { type: "listItem", attrs: { id: null }, content };
}

const pageSetup: PageSetup = {
  orientation: "landscape",
  margins: { top: 1.27, bottom: 2, left: 3.5, right: 2.5 },
};
const headerFooter: HeaderFooter = {
  pageNumbers: { position: "center", skipFirst: true },
  header: { text: "Famille Martin – été 2026", align: "right" },
  footer: { text: "Confidentiel", align: "center" },
  skipFirst: false,
};

/** Document qui utilise toute la mise en forme de Nano Buro, des lots A à J. */
const ORIGINAL: DocumentJson = {
  type: "doc",
  attrs: { ...pageSetupAttrs(pageSetup), ...headerFooterAttrs(headerFooter) },
  content: [
    { type: "tableOfContents", attrs: { id: null } },
    { type: "heading", attrs: { id: null, level: 1 }, content: [text("Vacances d'été")] },
    para([
      text("Gras", [{ type: "bold" }]),
      text(" italique", [{ type: "italic" }]),
      text(" souligné", [{ type: "underline" }]),
      text(" barré", [{ type: "strike" }]),
      text(" rouge", [
        { type: "textStyle", attrs: { fontFamily: null, fontSize: null, color: "#C62828" } },
      ]),
      text(" surligné", [{ type: "highlight", attrs: { color: "#C5E1A5" } }]),
      text(" m"),
      text("2", [{ type: "superscript" }]),
      text(" H"),
      text("2", [{ type: "subscript" }]),
      text("O "),
      text("lien", [{ type: "link", attrs: { href: "https://example.org/page" } }]),
    ]),
    para(
      [
        text("Garamond 14", [
          {
            type: "textStyle",
            attrs: { fontFamily: "EB Garamond", fontSize: "14pt", color: null },
          },
        ]),
        text(" mono", [
          {
            type: "textStyle",
            attrs: { fontFamily: "IBM Plex Mono", fontSize: null, color: "#1565C0" },
          },
        ]),
      ],
      { textAlign: "center", lineHeight: "1.5" },
    ),
    para([text("Retrait de deux niveaux, justifié")], { indent: 2, textAlign: "justify" }),
    { type: "heading", attrs: { id: null, level: 2 }, content: [text("Liste")] },
    {
      type: "bulletList",
      content: [
        item(para([text("Premier")]), para([text("suite du premier")])),
        item(para([text("Deuxième")]), {
          type: "orderedList",
          attrs: { start: 1 },
          content: [item(para([text("un")])), item(para([text("deux")]))],
        }),
      ],
    },
    { type: "heading", attrs: { id: null, level: 3 }, content: [text("Tableau")] },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", attrs: { id: null }, content: [para([text("Nom")])] },
            { type: "tableHeader", attrs: { id: null }, content: [para([text("Âge")])] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", attrs: { id: null }, content: [para([text("Élodie 😀")])] },
            { type: "tableCell", attrs: { id: null }, content: [para([text("12")])] },
          ],
        },
      ],
    },
    { type: "image", attrs: { id: null, hash, alt: "Plage", width: 120, textAlign: "center" } },
    { type: "pageBreak", attrs: { id: null } },
    {
      type: "callout",
      attrs: { id: null, calloutStyle: "border-shaded" },
      content: [para([text("Encadré, premier paragraphe")]), para([text("second paragraphe")])],
    },
    {
      type: "callout",
      attrs: { id: null, calloutStyle: "shaded" },
      content: [para([text("Fond gris")])],
    },
    para([text("Fin")]),
  ],
};

/** Retire les identifiants de bloc, et les attributs vides que le schéma remet par défaut. */
function withoutIds(node: DocumentJson): DocumentJson {
  const attrs = Object.fromEntries(
    Object.entries(node.attrs ?? {}).filter(([key, value]) => key !== "id" && value !== null),
  );
  return {
    ...node,
    attrs,
    ...(node.content ? { content: node.content.map(withoutIds) } : {}),
  };
}

async function exported(): Promise<Uint8Array> {
  return exportWord({
    content: ORIGINAL,
    pageSetup,
    headerFooter,
    images: new Map([[hash, { type: "png", data: image.data, width: 300, height: 150 }]]),
    fonts: [],
  });
}

describe("T2.18 : aller-retour Nano Buro, Word, Nano Buro", () => {
  it("le fichier d'exemple exporté par Nano Buro est à jour", async () => {
    if (process.env.UPDATE_WORD_FIXTURES) writeFileSync(FIXTURE, await exported());
    expect(readFileSync(FIXTURE).length).toBeGreaterThan(0);
  });

  for (const [source, bytes] of [
    ["exporté à l'instant", exported],
    ["rangé dans tests/fixtures", async () => new Uint8Array(readFileSync(FIXTURE))],
  ] as const) {
    it(`critère 2 : un fichier ${source} se rouvre à l'identique, hors identifiants`, async () => {
      const result = await readWordFile(await bytes(), parser);
      if (!result.ok) throw new Error(result.error);
      const prepared = new Map(
        [...result.conversion.images].map(([key, data]) => [
          key,
          { type: "image/png" as const, data },
        ]),
      );
      const { document, skipped } = wordDocument(result.conversion, prepared, "Vacances.docx");
      const reopened = contentOf(document.ydoc);
      const expected = ydocFromJson(ORIGINAL);
      writePageSetup(expected, pageSetup);
      writeHeaderFooter(expected, headerFooter);
      expect(withoutIds(reopened)).toEqual(withoutIds(contentOf(expected)));
      expect([...skipped]).toEqual([]);
      expect(result.conversion.trackedChanges).toBe(false);
    });
  }
});
