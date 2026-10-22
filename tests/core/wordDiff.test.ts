// Tests de la comparaison au mot (src/core/wordDiff.ts, T3.1, critères 7 et 15) : accents, emojis,
// ponctuation, texte vide ou très long, compte des mots.
import { describe, expect, it } from "vitest";
import { countWords, diffWords, wordTokens, type TextChange } from "../../src/core/wordDiff";

/** Applique des modifications à un texte, pour vérifier qu'elles donnent bien la correction. */
function apply(text: string, changes: TextChange[]): string {
  let result = text;
  for (const change of [...changes].reverse()) {
    result = result.slice(0, change.from) + change.insert + result.slice(change.to);
  }
  return result;
}

describe("T3.1 : comparaison au mot", () => {
  it("critère 7 : une faute corrigée dans une phrase ne montre que ce mot", () => {
    const original = "Les enfant jouent dans le jardin.";
    const corrected = "Les enfants jouent dans le jardin.";
    const changes = diffWords(original, corrected);
    expect(changes).toEqual([{ from: 4, to: 10, removed: "enfant", insert: "enfants" }]);
    expect(apply(original, changes)).toBe(corrected);
  });

  it("critère 7 : les accents restent dans leur mot", () => {
    expect(wordTokens("été à Noël")).toEqual(["été", " ", "à", " ", "Noël"]);
    const changes = diffWords(
      "Il a mangé a midi et a ete content.",
      "Il a mangé à midi et a été content.",
    );
    expect(changes.map((change) => [change.removed, change.insert])).toEqual([
      ["a", "à"],
      ["ete", "été"],
    ]);
  });

  it("critère 7 : un emoji compte pour son nombre d'unités, sans décaler les positions", () => {
    const original = "Bravo 🎉 pour ton examain !";
    const corrected = "Bravo 🎉 pour ton examen !";
    const changes = diffWords(original, corrected);
    expect(changes.map((change) => original.slice(change.from, change.to))).toEqual(["examain"]);
    expect(apply(original, changes)).toBe(corrected);
  });

  it("critère 7 : la ponctuation ajoutée ou retirée est une modification à part", () => {
    const original = "Bonjour Marie comment vas-tu";
    const corrected = "Bonjour Marie, comment vas-tu ?";
    const changes = diffWords(original, corrected);
    expect(changes.map((change) => change.insert)).toEqual([",", " ?"]);
    expect(changes.every((change) => change.removed === "")).toBe(true);
    expect(apply(original, changes)).toBe(corrected);
  });

  it("critère 7 : des textes égaux ne donnent aucune modification, un texte vide non plus", () => {
    expect(diffWords("Rien à corriger.", "Rien à corriger.")).toEqual([]);
    expect(diffWords("", "")).toEqual([]);
    expect(apply("", diffWords("", "Ajout"))).toBe("Ajout");
    expect(apply("Tout retirer", diffWords("Tout retirer", ""))).toBe("");
  });

  it("critère 7 : un texte très long réécrit en entier reste comparé sans bloquer", () => {
    const original = Array.from({ length: 2500 }, (_, index) => `mot${index}`).join(" ");
    const corrected = Array.from({ length: 2500 }, (_, index) => `autre${index}`).join(" ");
    const started = performance.now();
    const changes = diffWords(original, corrected);
    expect(performance.now() - started).toBeLessThan(5000);
    expect(apply(original, changes)).toBe(corrected);
  });

  it("critère 15 : compte les mots, nombres compris, sans la ponctuation ni les emojis", () => {
    expect(countWords("")).toBe(0);
    // « J'ai » est un seul mot, comme pour le compteur de mots de Word.
    expect(countWords("Bonjour, ça va ? 😀 J'ai 12 ans.")).toBe(6);
    expect(countWords("mot ".repeat(5001))).toBe(5001);
  });
});
