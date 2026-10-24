// Compteur de mots (T2.11) : mots comme dans Word, caractères, paragraphes, textes du pied de page, cache par bloc.
import { describe, expect, it } from "vitest";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { documentSchema } from "../../src/core/schema";
import type { DocumentJson } from "../../src/core/types";
import {
  frenchNumber,
  nodeStats,
  rangeStats,
  textStats,
  wordCounterText,
} from "../../src/core/wordCount";

function para(text: string): DocumentJson {
  return {
    type: "paragraph",
    attrs: { id: null },
    ...(text ? { content: [{ type: "text", text }] } : {}),
  };
}

function docNode(...content: DocumentJson[]): ProseMirrorNode {
  return ProseMirrorNode.fromJSON(documentSchema, { type: "doc", content });
}

describe("T2.11 : compteur de mots", () => {
  it("critère 2 : un mot est une suite de caractères entre deux espaces, comme dans Word", () => {
    expect(textStats("l'école").words).toBe(1);
    expect(textStats("porte-clés").words).toBe(1);
    expect(textStats("En 2026, 12 élèves").words).toBe(4);
    expect(textStats("  deux   espaces\tet tab  ").words).toBe(4);
    expect(textStats("").words).toBe(0);
    expect(textStats("   ").words).toBe(0);
  });

  it("critère 2 : accents et emojis comptent pour un caractère", () => {
    expect(textStats("Élève 🇫🇷 👍🏽")).toEqual({
      words: 3,
      characters: 9,
      charactersNoSpaces: 7,
      paragraphs: 1,
    });
  });

  it("critère 2 : les titres, les listes et les cellules comptent ; images et sauts de page non", () => {
    const doc = docNode(
      {
        type: "heading",
        attrs: { id: null, level: 1 },
        content: [{ type: "text", text: "Mon titre" }],
      },
      {
        type: "bulletList",
        content: [{ type: "listItem", attrs: { id: null }, content: [para("un élément")] }],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableCell", attrs: { id: null }, content: [para("cellule")] },
              { type: "tableCell", attrs: { id: null }, content: [para("")] },
            ],
          },
        ],
      },
      { type: "pageBreak", attrs: { id: null } },
      { type: "image", attrs: { id: null, hash: null, alt: "Une photo de vacances" } },
      para("fin"),
    );
    expect(nodeStats(doc)).toEqual({
      words: 6,
      characters: 29,
      charactersNoSpaces: 27,
      paragraphs: 4,
    });
  });

  it("critère 2 : deux paragraphes ne collent jamais leurs mots", () => {
    expect(nodeStats(docNode(para("fin"), para("début"))).words).toBe(2);
  });

  it("critère 1 : une sélection compte seulement le texte choisi, sur plusieurs paragraphes", () => {
    const doc = docNode(para("un deux trois"), para("quatre cinq"));
    // « deux trois » puis « quatre » : de la position 5 (après « un ») à la fin de « quatre ».
    const end = doc.content.child(0).nodeSize + 1 + "quatre".length;
    expect(rangeStats(doc, [{ from: 4, to: end }]).words).toBe(3);
    expect(rangeStats(doc, [{ from: 4, to: 4 }]).words).toBe(0);
  });

  it("critère 1 : « 1 234 mots », « 45 mots sur 1 234 », singulier jusqu'à un mot", () => {
    const space = frenchNumber(1234).charAt(1);
    expect(space).toMatch(/\s/u);
    expect(wordCounterText(1234, null)).toBe(`1${space}234 mots`);
    expect(wordCounterText(1234, 45)).toBe(`45 mots sur 1${space}234`);
    expect(wordCounterText(0, null)).toBe("0 mot");
    expect(wordCounterText(1, null)).toBe("1 mot");
    expect(wordCounterText(12, 1)).toBe("1 mot sur 12");
  });

  it("critère 4 : 100 pages (50 000 mots) se recomptent vite quand un seul paragraphe change", () => {
    const line = "Il était une fois une famille qui écrivait beaucoup de lettres à la main.";
    const paragraphs = Array.from({ length: 4000 }, () => para(line));
    const doc = docNode(...paragraphs);
    const first = performance.now();
    expect(nodeStats(doc).words).toBe(4000 * 14);
    const firstTime = performance.now() - first;
    const changed = docNode(...paragraphs.slice(0, -1), para(`${line} encore`));
    const start = performance.now();
    // Nœuds tous neufs ici (relus depuis JSON) : le premier compte doit déjà rester rapide.
    expect(nodeStats(changed).words).toBe(4000 * 14 + 1);
    expect(performance.now() - start).toBeLessThan(500);
    expect(firstTime).toBeLessThan(500);
    const again = performance.now();
    nodeStats(changed);
    expect(performance.now() - again).toBeLessThan(5);
  });
});
