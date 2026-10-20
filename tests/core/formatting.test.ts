// Aller-retour du format `.nano` avec la mise en forme du lot A (T1.1 à T1.4) : le fichier relu
// redonne exactement les titres, listes, alignements, polices et tailles enregistrés.
import { describe, expect, it } from "vitest";
import { createDocumentId, parseDocument, serializeDocument } from "../../src/core/fileFormat";
import { documentSchema } from "../../src/core/schema";
import type { DocumentJson } from "../../src/core/types";
import { jsonFromYdoc, paragraph, ydocFromJson } from "./helpers";

/** Sérialise puis relit un document ; vérifie que l'état Yjs relu est bien la source utilisée. */
function roundTrip(json: DocumentJson): DocumentJson {
  documentSchema.nodeFromJSON(json).check();
  const text = serializeDocument({ id: createDocumentId(), ydoc: ydocFromJson(json) });
  const result = parseDocument(text);
  if (!result.ok) throw new Error(`Lecture échouée : ${result.error}`);
  const reread = jsonFromYdoc(result.ydoc);
  expect((JSON.parse(text) as { content: DocumentJson }).content).toEqual(reread);
  return reread;
}

function heading(id: string, level: number, text: string): DocumentJson {
  return { type: "heading", attrs: { id, level }, content: [{ type: "text", text }] };
}

describe("T1.1 : titres", () => {
  it("aller-retour du format de fichier avec les trois niveaux de titre", () => {
    const json: DocumentJson = {
      type: "doc",
      content: [
        heading("h-1", 1, "Exposé sur les volcans 🌋"),
        heading("h-2", 2, "Introduction"),
        heading("h-3", 3, "Le Piton de la Fournaise"),
        paragraph("p-1", { text: "Un texte normal, " }, { text: "en gras", marks: ["bold"] }),
      ],
    };
    const reread = roundTrip(json);
    expect(
      reread.content?.map((block) => [block.type, block.attrs?.level, block.attrs?.id]),
    ).toEqual([
      ["heading", 1, "h-1"],
      ["heading", 2, "h-2"],
      ["heading", 3, "h-3"],
      ["paragraph", undefined, "p-1"],
    ]);
    expect(reread.content?.[0]?.content?.[0]?.text).toBe("Exposé sur les volcans 🌋");
  });

  it("un titre peut contenir du gras et de l'italique (critère 8)", () => {
    const json: DocumentJson = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { id: "h-1", level: 2 },
          content: [
            { type: "text", text: "Un " },
            { type: "text", text: "grand", marks: [{ type: "bold" }, { type: "italic" }] },
          ],
        },
      ],
    };
    const marks = roundTrip(json).content?.[0]?.content?.[1]?.marks?.map((mark) => mark.type);
    expect(marks).toEqual(["bold", "italic"]);
  });
});

/** Élément de liste : un paragraphe, puis éventuellement une sous-liste. */
function item(id: string, text: string, sublist?: DocumentJson): DocumentJson {
  return {
    type: "listItem",
    attrs: { id },
    content: [paragraph(`${id}-p`, { text }), ...(sublist ? [sublist] : [])],
  };
}

describe("T1.2 : listes", () => {
  it("aller-retour avec listes imbriquées des deux types, sur trois niveaux", () => {
    const json: DocumentJson = {
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: 1, type: null },
          content: [
            item("li-1", "Préparer la pâte", {
              type: "bulletList",
              content: [
                item("li-1-1", "farine 🌾", {
                  type: "orderedList",
                  attrs: { start: 1, type: null },
                  content: [item("li-1-1-1", "tamiser")],
                }),
                item("li-1-2", "œufs"),
              ],
            }),
            item("li-2", "Cuire"),
          ],
        },
        paragraph("p-1", { text: "Bon appétit !" }),
      ],
    };
    const reread = roundTrip(json);
    const [list] = reread.content ?? [];
    expect(list?.type).toBe("orderedList");
    const sub = list?.content?.[0]?.content?.[1];
    expect(sub?.type).toBe("bulletList");
    expect(sub?.content?.[0]?.content?.[1]?.type).toBe("orderedList");
    expect(sub?.content?.[0]?.content?.[1]?.content?.[0]?.attrs?.id).toBe("li-1-1-1");
    expect(list?.content?.map((entry) => entry.attrs?.id)).toEqual(["li-1", "li-2"]);
    expect(reread.content?.[1]?.attrs?.id).toBe("p-1");
  });
});

describe("T1.3 : alignement", () => {
  it("aller-retour avec les quatre alignements, sur des paragraphes et un titre", () => {
    const aligned = (id: string, textAlign: string | null, text: string): DocumentJson => ({
      type: "paragraph",
      attrs: { id, textAlign },
      content: [{ type: "text", text }],
    });
    const json: DocumentJson = {
      type: "doc",
      content: [
        aligned("p-1", "right", "Mme Dupont, 3 rue des Lilas"),
        {
          ...heading("h-1", 1, "Invitation 🎉"),
          attrs: { id: "h-1", level: 1, textAlign: "center" },
        },
        aligned("p-2", "justify", "Un long corps de lettre justifié."),
        aligned("p-3", "left", "À gauche, explicitement."),
        aligned("p-4", null, "À gauche, par défaut."),
      ],
    };
    const reread = roundTrip(json);
    expect(reread.content?.map((block) => block.attrs?.textAlign ?? null)).toEqual([
      "right",
      "center",
      "justify",
      "left",
      null,
    ]);
  });
});
