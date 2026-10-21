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

describe("T1.4 : police et taille", () => {
  /** Texte avec une police et une taille, `null` pour la valeur par défaut. */
  function styled(text: string, fontFamily: string | null, fontSize: string | null): DocumentJson {
    return { type: "text", text, marks: [{ type: "textStyle", attrs: { fontFamily, fontSize } }] };
  }

  it("aller-retour avec plusieurs polices et tailles dans un même paragraphe", () => {
    const json: DocumentJson = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "p-1" },
          content: [
            { type: "text", text: "Par défaut, " },
            styled("Garamond 36, ", "EB Garamond", "36pt"),
            styled("Mono 8, ", "IBM Plex Mono", "8pt"),
            {
              ...styled("Serif gras 72 😀", "IBM Plex Serif", "72pt"),
              marks: [
                { type: "bold" },
                { type: "textStyle", attrs: { fontFamily: "IBM Plex Serif", fontSize: "72pt" } },
              ],
            },
            styled(" taille seule", null, "14pt"),
          ],
        },
      ],
    };
    const parts = roundTrip(json).content?.[0]?.content ?? [];
    const summary = parts.map((part) => {
      const attrs = part.marks?.find((mark) => mark.type === "textStyle")?.attrs;
      return [part.text, attrs?.fontFamily ?? null, attrs?.fontSize ?? null];
    });
    expect(summary).toEqual([
      ["Par défaut, ", null, null],
      ["Garamond 36, ", "EB Garamond", "36pt"],
      ["Mono 8, ", "IBM Plex Mono", "8pt"],
      ["Serif gras 72 😀", "IBM Plex Serif", "72pt"],
      [" taille seule", null, "14pt"],
    ]);
  });

  it("critère 8 : une police inconnue de l'application est relue sans erreur et son nom reste enregistré", () => {
    const json: DocumentJson = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "p-1" },
          content: [styled("Futur", "Futura Nova 2030", "13pt")],
        },
      ],
    };
    const text = serializeDocument({ id: "doc-1", ydoc: ydocFromJson(json) });
    const result = parseDocument(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const attrs = jsonFromYdoc(result.ydoc).content?.[0]?.content?.[0]?.marks?.[0]?.attrs;
    expect(attrs).toEqual({ fontFamily: "Futura Nova 2030", fontSize: "13pt", color: null });
    // Et il est réécrit tel quel à l'enregistrement suivant.
    expect(serializeDocument({ id: "doc-1", ydoc: result.ydoc })).toContain("Futura Nova 2030");
  });
});

describe("T1.7 : couleur du texte et surlignage", () => {
  it("critère 7 et 9 : aller-retour de la couleur et du surlignage, dans content et dans ydoc", () => {
    const json: DocumentJson = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "p-1" },
          content: [
            { type: "text", text: "Rendez-vous le " },
            {
              type: "text",
              text: "12 mai",
              marks: [{ type: "highlight", attrs: { color: "#FFF176" } }],
            },
            { type: "text", text: " : " },
            {
              type: "text",
              text: "45 € 😀",
              marks: [
                { type: "bold" },
                {
                  type: "textStyle",
                  attrs: { color: "#C62828", fontFamily: "EB Garamond", fontSize: "14pt" },
                },
                { type: "highlight", attrs: { color: "#C5E1A5" } },
              ],
            },
          ],
        },
      ],
    };
    const text = serializeDocument({ id: createDocumentId(), ydoc: ydocFromJson(json) });
    const saved = JSON.parse(text) as { version: number; content: DocumentJson };
    // Version 2 depuis T1.9 (images) : la couleur n'a pas changé le format.
    expect(saved.version).toBe(2);
    expect(JSON.stringify(saved.content)).toContain('"color":"#C62828"');
    const marks = roundTrip(json).content?.[0]?.content?.map((part) => part.marks);
    expect(marks?.[1]).toEqual([{ type: "highlight", attrs: { color: "#FFF176" } }]);
    const byType = Object.fromEntries((marks?.[3] ?? []).map((mark) => [mark.type, mark.attrs]));
    expect(Object.keys(byType).sort()).toEqual(["bold", "highlight", "textStyle"]);
    expect(byType.textStyle).toEqual({
      color: "#C62828",
      fontFamily: "EB Garamond",
      fontSize: "14pt",
    });
    expect(byType.highlight).toEqual({ color: "#C5E1A5" });
  });
});

describe("T1.8 : tableaux", () => {
  const cell = (type: string, id: string, text: string): DocumentJson => ({
    type,
    attrs: { id },
    content: [paragraph(`${id}-p`, { text })],
  });

  it("critère 6 et 9 : aller-retour d'un tableau, chaque cellule garde son identifiant, format version 2 (T1.9)", () => {
    const json: DocumentJson = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [cell("tableHeader", "h-1", "Poste"), cell("tableHeader", "h-2", "Montant")],
            },
            {
              type: "tableRow",
              content: [cell("tableCell", "c-1", "Courses 🛒"), cell("tableCell", "c-2", "350 €")],
            },
          ],
        },
        paragraph("p-1", { text: "Après le tableau" }),
      ],
    };
    const text = serializeDocument({ id: createDocumentId(), ydoc: ydocFromJson(json) });
    expect((JSON.parse(text) as { version: number }).version).toBe(2);
    const reread = roundTrip(json);
    const ids: unknown[] = [];
    const visit = (node: DocumentJson) => {
      if (node.type === "tableCell" || node.type === "tableHeader") ids.push(node.attrs?.id);
      node.content?.forEach(visit);
    };
    visit(reread);
    expect(ids).toEqual(["h-1", "h-2", "c-1", "c-2"]);
    expect(reread.content?.map((block) => block.type)).toEqual(["table", "paragraph"]);
  });

  it("critère 10 : un tableau de 50 lignes et 10 colonnes s'enregistre et se relit", () => {
    const rows = Array.from({ length: 50 }, (_, r) => ({
      type: "tableRow",
      content: Array.from({ length: 10 }, (_, c) =>
        cell(
          r === 0 ? "tableHeader" : "tableCell",
          `c-${String(r)}-${String(c)}`,
          `${String(r)}×${String(c)}`,
        ),
      ),
    }));
    const json: DocumentJson = { type: "doc", content: [{ type: "table", content: rows }] };
    const reread = roundTrip(json);
    expect(reread.content?.[0]?.content).toHaveLength(50);
  });
});
