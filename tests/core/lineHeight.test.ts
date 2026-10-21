// Interligne (T2.2) : valeurs proposées, hauteur de ligne CSS équivalente à Word, aller-retour du
// format `.nano` sans changement de structure.
import { describe, expect, it } from "vitest";
import { createDocumentId, parseDocument, serializeDocument } from "../../src/core/fileFormat";
import { cssLineHeight, LINE_HEIGHTS } from "../../src/core/lineHeight";
import { documentSchema } from "../../src/core/schema";
import { NANO_FORMAT_VERSION, type DocumentJson } from "../../src/core/types";
import { jsonFromYdoc, ydocFromJson } from "./helpers";

describe("T2.2 : interligne", () => {
  it("critère 1 : la liste propose 1, 1,15, 1,5 et 2 (en plus de Par défaut)", () => {
    expect(LINE_HEIGHTS.map((entry) => entry.label)).toEqual(["1", "1,15", "1,5", "2"]);
  });

  it("critère 3 : les valeurs suivent Word (1 vaut 1,2 fois la taille du texte)", () => {
    expect(LINE_HEIGHTS.map((entry) => cssLineHeight(entry.value))).toEqual([
      "1.2",
      "1.38",
      "1.8",
      "2.4",
    ]);
  });

  it("une valeur inconnue ou dangereuse n'est pas écrite en style", () => {
    for (const value of [null, "", "abc", "1;color:red", "-1", "100", 2]) {
      expect(cssLineHeight(value)).toBeNull();
    }
    expect(cssLineHeight("3")).toBe("3.6");
  });

  it("critère 6 et 8 : gardé à l'enregistrement et à la réouverture, sans changer la version du format", () => {
    const json: DocumentJson = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { id: "h-1", level: 1, lineHeight: "1" },
          content: [{ type: "text", text: "Lettre à Zoé 😀" }],
        },
        {
          type: "paragraph",
          attrs: { id: "p-1", lineHeight: "1.5" },
          content: [{ type: "text", text: "Interligne 1,5" }],
        },
        { type: "paragraph", attrs: { id: "p-2" }, content: [{ type: "text", text: "Défaut" }] },
      ],
    };
    documentSchema.nodeFromJSON(json).check();
    const text = serializeDocument({ id: createDocumentId(), ydoc: ydocFromJson(json) });
    const file = JSON.parse(text) as { version: number; content: DocumentJson };
    expect(file.version).toBe(NANO_FORMAT_VERSION);
    expect(file.version).toBe(2);
    const result = parseDocument(text);
    if (!result.ok) throw new Error(result.error);
    const reread = jsonFromYdoc(result.ydoc);
    expect(reread.content?.map((block) => block.attrs?.lineHeight)).toEqual([
      "1",
      "1.5",
      undefined,
    ]);
    expect(file.content).toEqual(reread);
  });
});
