// Type de faute de chaque correction de « Corriger » (T2.23, critères 1 à 4) : demandé dans la même
// requête, lu dans la réponse, retrouvé pour chaque modification, et « Autre » à défaut.
import { describe, expect, it } from "vitest";
import {
  buildRequest,
  correctionChanges,
  parseCorrections,
  parseParagraphs,
  withMistakeTypes,
} from "../../src/core/assistant";
import { MISTAKE_TYPES } from "../../src/core/mistakes";

const SENT = "Les enfant sont aller a l'école.";
const FIXED = "Les enfants sont allés à l'école.";

function changesFor(raw: string) {
  const parsed = parseParagraphs(raw, 1);
  if (!parsed) throw new Error("réponse illisible");
  return withMistakeTypes(correctionChanges([{ text: SENT }], parsed), parseCorrections(raw));
}

describe("T2.23 : type de faute des corrections", () => {
  it("critère 2 : le type est demandé dans le format de la même réponse, sans autre texte envoyé", () => {
    const request = buildRequest("correct", [SENT]);
    expect(request.user).toBe(JSON.stringify({ paragraphs: [SENT] }));
    const corrections = (request.schema.properties as Record<string, { items: unknown }>)
      .corrections;
    expect(corrections?.items).toMatchObject({
      properties: { type: { enum: [...MISTAKE_TYPES] } },
      required: ["paragraph", "before", "after", "type"],
    });
    for (const type of MISTAKE_TYPES) expect(request.system).toContain(`- ${type} :`);
    // La traduction n'a pas de types.
    expect(JSON.stringify(buildRequest("translate", [SENT]).schema)).not.toContain("corrections");
  });

  it("critère 1 : chaque modification reçoit le type annoncé pour elle", () => {
    const raw = JSON.stringify({
      paragraphs: [FIXED],
      corrections: [
        { paragraph: 0, before: "enfant", after: "enfants", type: "agreement" },
        { paragraph: 0, before: "aller", after: "allés", type: "conjugation" },
        { paragraph: 0, before: "a", after: "à", type: "homophone" },
      ],
    });
    expect(
      changesFor(raw).map(({ removed, insert, mistake }) => [removed, insert, mistake]),
    ).toEqual([
      ["enfant", "enfants", "agreement"],
      ["aller", "allés", "conjugation"],
      ["a", "à", "homophone"],
    ]);
  });

  it("critère 1 : une correction annoncée sur plusieurs mots donne son type à chacun", () => {
    const raw = JSON.stringify({
      paragraphs: [FIXED],
      corrections: [{ paragraph: 0, before: "aller a", after: "allés à", type: "conjugation" }],
    });
    const types = changesFor(raw).map((change) => change.mistake);
    expect(types).toEqual(["other", "conjugation", "conjugation"]);
  });

  it("critère 3 : un type inconnu, une réponse sans types ou abîmée donnent « Autre », sans rien bloquer", () => {
    const unknown = JSON.stringify({
      paragraphs: [FIXED],
      corrections: [{ paragraph: 0, before: "enfant", after: "enfants", type: "grammaire" }],
    });
    expect(changesFor(unknown).map((change) => change.mistake)).toEqual([
      "other",
      "other",
      "other",
    ]);
    const none = JSON.stringify({ paragraphs: [FIXED] });
    expect(changesFor(none)).toHaveLength(3);
    expect(changesFor(none).every((change) => change.mistake === "other")).toBe(true);
    expect(parseCorrections("pas du JSON")).toEqual([]);
    expect(parseCorrections(JSON.stringify({ corrections: "non" }))).toEqual([]);
    expect(
      parseCorrections(
        JSON.stringify({ corrections: [null, { before: 1 }, { before: "a", after: "à" }] }),
      ),
    ).toEqual([{ paragraph: -1, before: "a", after: "à", type: "other" }]);
  });

  it("critère 1 : un mauvais numéro de paragraphe n'empêche pas de retrouver le même texte", () => {
    const raw = JSON.stringify({
      paragraphs: [FIXED],
      corrections: [{ paragraph: 4, before: "a", after: "à", type: "homophone" }],
    });
    expect(changesFor(raw).find((change) => change.removed === "a")?.mistake).toBe("homophone");
  });

  it("critère 4 : les modifications proposées ne changent pas", () => {
    const raw = JSON.stringify({ paragraphs: [FIXED], corrections: [] });
    const parsed = parseParagraphs(raw, 1);
    if (!parsed) throw new Error("réponse illisible");
    const plain = correctionChanges([{ text: SENT }], parsed);
    expect(changesFor(raw)).toEqual(plain.map((change) => ({ ...change, mistake: "other" })));
  });

  it("critère 1 : une correction ne donne son type qu'aux mots entiers qu'elle contient", () => {
    const raw = JSON.stringify({
      paragraphs: [FIXED],
      corrections: [{ paragraph: 0, before: "la", after: "là", type: "accent" }],
    });
    // « a » n'est pas dans « la » : sans correction annoncée pour lui, il reste « Autre ».
    expect(changesFor(raw).find((change) => change.removed === "a")?.mistake).toBe("other");
  });

  it("critère 1 : le même texte annoncé l'emporte sur une correction regroupée", () => {
    const raw = JSON.stringify({
      paragraphs: [FIXED],
      corrections: [
        { paragraph: 0, before: "aller a", after: "allés à", type: "conjugation" },
        { paragraph: 0, before: "a", after: "à", type: "homophone" },
      ],
    });
    const types = Object.fromEntries(
      changesFor(raw).map((change) => [change.removed, change.mistake]),
    );
    expect(types).toMatchObject({ aller: "conjugation", a: "homophone" });
  });
});
