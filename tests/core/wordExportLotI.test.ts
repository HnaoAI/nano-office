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
