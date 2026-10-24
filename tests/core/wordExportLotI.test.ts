// Export Word du lot I : souligné (T2.10), liens (T2.12), exposant et indice (T2.13), retrait (T2.14) et
// encadré (T2.19), lus dans le XML du fichier .docx produit, sans navigateur.
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SETUP } from "../../src/core/pageSetup";
import type { DocumentJson } from "../../src/core/types";
import { exportWord } from "../../src/core/wordExport";

function textNode(text: string, marks?: DocumentJson["marks"]): DocumentJson {
  return { type: "text", text, ...(marks ? { marks } : {}) };
}

function para(text: string, attrs: Record<string, unknown> = {}, marks?: DocumentJson["marks"]) {
  return { type: "paragraph", attrs: { id: null, ...attrs }, content: [textNode(text, marks)] };
}

function doc(...content: DocumentJson[]): DocumentJson {
  return { type: "doc", content };
}

/** Texte d'un fichier de l'archive .docx exportée. */
async function exported(content: DocumentJson, path = "word/document.xml"): Promise<string> {
  const bytes = await exportWord({
    content,
    pageSetup: DEFAULT_PAGE_SETUP,
    images: new Map(),
    fonts: [],
  });
  const zip = await JSZip.loadAsync(bytes);
  return (await zip.file(path)?.async("string")) ?? "";
}

describe("T2.10 : souligné dans l'export Word", () => {
  it("critère 3 : un texte souligné l'est dans Word, cumulé avec le gras", async () => {
    const body = await exported(
      doc(para("Souligné", {}, [{ type: "underline" }, { type: "bold" }])),
    );
    expect(body).toContain('<w:u w:val="single"/>');
    expect(body).toContain("<w:b/>");
  });
});

describe("T2.13 : exposant et indice dans l'export Word", () => {
  it("critère 4 : un exposant et un indice gardent leur position dans Word", async () => {
    const body = await exported(
      doc({
        type: "paragraph",
        attrs: { id: null },
        content: [
          textNode("m"),
          textNode("2", [{ type: "superscript" }]),
          textNode(" H"),
          textNode("2", [{ type: "subscript" }]),
          textNode("O"),
        ],
      }),
    );
    expect(body).toContain('<w:vertAlign w:val="superscript"/>');
    expect(body).toContain('<w:vertAlign w:val="subscript"/>');
  });
});

describe("T2.14 : retrait dans l'export Word", () => {
  it("critère 3 : un paragraphe en retrait de 2 niveaux est décalé de 2,5 cm dans Word", async () => {
    const body = await exported(doc(para("Citation", { indent: 2 }), para("Normal")));
    expect(body).toContain('<w:ind w:left="1418"/>');
    expect(body.match(/<w:ind /g)).toHaveLength(1);
  });
});
