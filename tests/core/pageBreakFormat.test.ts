// Saut de page dans le format `.nano` et dans l'export Word (T2.8, critères 6 et 8) : bloc gardé avec son
// identifiant à l'enregistrement et à la réouverture, sans changement de version du format, et saut de
// page de Word dans le fichier `.docx`.
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseDocument, serializeDocument } from "../../src/core/fileFormat";
import { DEFAULT_PAGE_SETUP } from "../../src/core/pageSetup";
import { NANO_FORMAT_VERSION, type DocumentJson } from "../../src/core/types";
import { exportWord } from "../../src/core/wordExport";
import { jsonFromYdoc, ydocFromJson } from "./helpers";

function para(id: string, text: string): DocumentJson {
  return { type: "paragraph", attrs: { id }, content: [{ type: "text", text }] };
}

const WITH_BREAK: DocumentJson = {
  type: "doc",
  content: [
    para("p-1", "Introduction, été 🌞"),
    { type: "pageBreak", attrs: { id: "b-1" } },
    para("p-2", "Conclusion"),
  ],
};

describe("T2.8 : saut de page dans le fichier", () => {
  it("critère 8 : le saut de page et son identifiant sont gardés à l'enregistrement et à la réouverture", () => {
    const text = serializeDocument({ id: "doc-1", ydoc: ydocFromJson(WITH_BREAK) });
    const file = JSON.parse(text) as { version: number; content: DocumentJson };
    expect(file.version).toBe(NANO_FORMAT_VERSION);
    expect(file.version).toBe(2);
    expect(file.content.content?.[1]).toEqual({ type: "pageBreak", attrs: { id: "b-1" } });
    const reopened = parseDocument(text);
    if (!reopened.ok) throw new Error(reopened.error);
    const blocks = jsonFromYdoc(reopened.ydoc).content ?? [];
    expect(blocks.map((block) => [block.type, block.attrs?.id])).toEqual([
      ["paragraph", "p-1"],
      ["pageBreak", "b-1"],
      ["paragraph", "p-2"],
    ]);
  });

  it("critère 8 : un fichier dont le saut de page est seulement dans `content` s'ouvre aussi", () => {
    const text = serializeDocument({ id: "doc-1", ydoc: ydocFromJson(WITH_BREAK) });
    const file = JSON.parse(text) as Record<string, unknown>;
    delete file.ydoc;
    const reopened = parseDocument(JSON.stringify(file));
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect((jsonFromYdoc(reopened.ydoc).content ?? []).map((block) => block.type)).toContain(
      "pageBreak",
    );
  });

  it("critère 6 : l'export Word contient un saut de page de Word entre les deux paragraphes", async () => {
    const bytes = await exportWord({
      content: WITH_BREAK,
      pageSetup: DEFAULT_PAGE_SETUP,
      images: new Map(),
      fonts: [],
    });
    const zip = await JSZip.loadAsync(bytes);
    const body = (await zip.file("word/document.xml")?.async("string")) ?? "";
    const pageBreak = body.indexOf('<w:br w:type="page"/>');
    expect(pageBreak).toBeGreaterThan(body.indexOf("Introduction"));
    expect(pageBreak).toBeLessThan(body.indexOf("Conclusion"));
    expect(body.match(/w:type="page"/g)).toHaveLength(1);
  });
});
