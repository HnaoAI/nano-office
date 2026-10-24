// Encadré dans le format `.nano` et dans l'export Word (T2.19, critères 4 à 6) : bloc gardé avec son identifiant et son
// style à l'enregistrement et à la réouverture, sans changement de version ; bordure et trame dans le `.docx`.
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { calloutStyle } from "../../src/core/calloutSchema";
import { parseDocument, serializeDocument } from "../../src/core/fileFormat";
import { DEFAULT_PAGE_SETUP } from "../../src/core/pageSetup";
import { NANO_FORMAT_VERSION, type DocumentJson } from "../../src/core/types";
import { exportWord } from "../../src/core/wordExport";
import { jsonFromYdoc, ydocFromJson } from "./helpers";

function para(id: string, text: string): DocumentJson {
  return { type: "paragraph", attrs: { id }, content: [{ type: "text", text }] };
}

function callout(id: string, style: string, ...content: DocumentJson[]): DocumentJson {
  return { type: "callout", attrs: { id, calloutStyle: style }, content };
}

const WITH_CALLOUT: DocumentJson = {
  type: "doc",
  content: [
    para("p-1", "Avant"),
    callout(
      "c-1",
      "border-shaded",
      {
        type: "heading",
        attrs: { id: "h-1", level: 3 },
        content: [{ type: "text", text: "Consigne" }],
      },
      para("p-2", "Lire le texte, puis répondre 📝"),
      {
        type: "bulletList",
        content: [{ type: "listItem", attrs: { id: "l-1" }, content: [para("p-3", "Question 1")] }],
      },
    ),
    para("p-4", "Après"),
  ],
};

async function documentXml(content: DocumentJson): Promise<string> {
  const bytes = await exportWord({
    content,
    pageSetup: DEFAULT_PAGE_SETUP,
    images: new Map(),
    fonts: [],
  });
  return (await (await JSZip.loadAsync(bytes)).file("word/document.xml")?.async("string")) ?? "";
}

describe("T2.19 : encadré dans le fichier", () => {
  it("critères 4 et 6 : l'encadré, son style et les identifiants sont gardés, sans changement de version", () => {
    const text = serializeDocument({ id: "doc-1", ydoc: ydocFromJson(WITH_CALLOUT) });
    const file = JSON.parse(text) as { version: number; content: DocumentJson };
    expect(file.version).toBe(NANO_FORMAT_VERSION);
    expect(file.version).toBe(2);
    expect(file.content.content?.[1]?.type).toBe("callout");
    expect(file.content.content?.[1]?.attrs).toEqual({ id: "c-1", calloutStyle: "border-shaded" });
    const reopened = parseDocument(text);
    if (!reopened.ok) throw new Error(reopened.error);
    expect(jsonFromYdoc(reopened.ydoc)).toEqual(file.content);
  });

  it("critère 2 : un style inconnu (fichier modifié à la main) devient le cadre fin", () => {
    expect(calloutStyle("arc-en-ciel")).toBe("border");
    expect(calloutStyle(null)).toBe("border");
    expect(calloutStyle("shaded")).toBe("shaded");
  });
});

describe("T2.19 : encadré dans l'export Word", () => {
  it("critère 5 : chaque paragraphe de l'encadré a la bordure et la trame de l'encadré", async () => {
    const body = await documentXml(WITH_CALLOUT);
    // Titre, paragraphe et élément de liste : trois paragraphes encadrés.
    expect(body.match(/<w:pBdr>/g)).toHaveLength(3);
    expect(body.match(/w:fill="F3F3F1"/g)).toHaveLength(3);
    expect(body).toMatch(/<w:top w:val="single" w:color="3A3A38" w:sz="6" w:space="9"\/>/);
    expect(body).toContain("Lire le texte, puis répondre 📝");
  });

  it("critère 5 : cadre fin sans fond, et fond sans cadre", async () => {
    const border = await documentXml({
      type: "doc",
      content: [callout("c-1", "border", para("p-1", "Cadre"))],
    });
    expect(border).toContain("<w:pBdr>");
    expect(border).not.toContain('w:fill="F3F3F1"');
    const shaded = await documentXml({
      type: "doc",
      content: [callout("c-1", "shaded", para("p-1", "Fond"))],
    });
    expect(shaded).toContain('w:fill="F3F3F1"');
    expect(shaded).not.toContain('w:color="3A3A38"');
  });

  it("critère 5 : dans Word, chaque paragraphe de l'encadré reste sur la page du suivant, sauf le dernier", async () => {
    const body = await documentXml({
      type: "doc",
      content: [
        callout("c-1", "border", para("p-1", "Un"), para("p-2", "Deux"), para("p-3", "Trois")),
      ],
    });
    const paragraphs = body.split("<w:p>").slice(1);
    const keep = (text: string) =>
      paragraphs.find((xml) => xml.includes(`>${text}<`))?.includes("<w:keepNext/>");
    expect([keep("Un"), keep("Deux"), keep("Trois")]).toEqual([true, true, false]);
  });
});
