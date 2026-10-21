// Rechercher et remplacer (T2.1) : recherche dans un texte, en code pur.
import { describe, expect, it } from "vitest";
import { findInText, foldCase, replacementStatus, searchStatus } from "../../src/core/search";

const texts = (text: string, query: string, caseSensitive = false) =>
  findInText(text, query, caseSensitive).map(({ from, to }) => text.slice(from, to));

describe("T2.1 : recherche dans un texte", () => {
  it("critère 3 : ignore les majuscules par défaut", () => {
    expect(texts("Bonjour, BONJOUR et bonjour", "bonjour")).toEqual([
      "Bonjour",
      "BONJOUR",
      "bonjour",
    ]);
    expect(texts("Élodie et élodie", "ÉLODIE")).toEqual(["Élodie", "élodie"]);
  });

  it("critère 3 : « Respecter les majuscules » change ce réglage", () => {
    expect(texts("Bonjour, BONJOUR et bonjour", "bonjour", true)).toEqual(["bonjour"]);
  });

  it("critère 2 : « 3 sur 12 » ou « Aucun résultat »", () => {
    expect(searchStatus("mot", 2, 12)).toBe("3 sur 12");
    expect(searchStatus("mot", -1, 0)).toBe("Aucun résultat");
    expect(searchStatus("", -1, 0)).toBe("");
    expect(searchStatus("mot", -1, 3)).toBe("Fin du document");
  });

  it("critère 6 : « 12 remplacements »", () => {
    expect(replacementStatus(12)).toBe("12 remplacements");
    expect(replacementStatus(1)).toBe("1 remplacement");
    expect(replacementStatus(0)).toBe("0 remplacements");
  });

  it("critère 8 : un texte cherché vide ne trouve rien", () => {
    expect(findInText("texte", "", false)).toEqual([]);
  });

  it("critère 8 : accents et emojis", () => {
    expect(texts("Café 😀 café 😀", "😀")).toEqual(["😀", "😀"]);
    expect(texts("cafe café", "café")).toEqual(["café"]);
    expect(texts("👨‍👩‍👧 famille 👨‍👩‍👧", "👨‍👩‍👧")).toHaveLength(2);
  });

  it("critère 8 : 1 000 occurrences dans un long texte, sans chevauchement", () => {
    const text = "aaa ".repeat(1000);
    const started = performance.now();
    expect(findInText(text, "aaa", false)).toHaveLength(1000);
    expect(findInText("aaaa", "aa", false)).toEqual([
      { from: 0, to: 2 },
      { from: 2, to: 4 },
    ]);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("le texte ramené en minuscules garde sa longueur", () => {
    const text = "İSTANBUL Ça ŒUVRE 😀";
    expect(foldCase(text)).toHaveLength(text.length);
    expect(foldCase("ÇA ŒUVRE")).toBe("ça œuvre");
  });
});
