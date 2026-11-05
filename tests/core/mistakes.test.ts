// Mes fautes (T2.23) : types de faute et repli sur « Autre », compte des corrections acceptées,
// 3 derniers exemples coupés à 40 caractères, Pareto (tri, cumul, seuil de 80 %), remise à zéro.
import { describe, expect, it } from "vitest";
import {
  emptyMistakeStats,
  MISTAKE_LABELS,
  MISTAKE_RULES,
  MISTAKE_TYPES,
  mistakeType,
  paretoRows,
  readMistakeStats,
  recordMistakes,
  totalMistakes,
  truncateExample,
  type MistakeStats,
  type MistakeType,
} from "../../src/core/mistakes";

const NOW = new Date("2026-11-05T10:00:00Z");

function statsWith(counts: Partial<Record<MistakeType, number>>): MistakeStats {
  let stats = emptyMistakeStats(NOW);
  for (const [type, count] of Object.entries(counts) as [MistakeType, number][]) {
    stats = recordMistakes(
      stats,
      Array.from({ length: count }, () => ({ type, before: "a", after: "à" })),
    );
  }
  return stats;
}

describe("T2.23 : types de faute", () => {
  it("critère 1 : la liste fixe des types, avec leur nom et une règle courte", () => {
    expect(MISTAKE_TYPES.map((type) => MISTAKE_LABELS[type])).toEqual([
      "Accord",
      "Conjugaison",
      "Homophone",
      "Accent",
      "Ponctuation",
      "Majuscule",
      "Orthographe d'usage",
      "Syntaxe",
      "Autre",
    ]);
    for (const type of MISTAKE_TYPES) {
      expect(MISTAKE_RULES[type].length).toBeGreaterThan(20);
      expect(MISTAKE_RULES[type].split(/(?<=\.)\s+/).length).toBeLessThanOrEqual(2);
    }
  });

  it("critère 3 : un type absent ou inconnu devient « Autre »", () => {
    expect(mistakeType("agreement")).toBe("agreement");
    expect(mistakeType("Homophone")).toBe("homophone");
    expect(mistakeType(" CONJUGATION ")).toBe("conjugation");
    for (const value of [undefined, null, "", "typo", 3, {}, "__proto__", "constructor"]) {
      expect(mistakeType(value)).toBe("other");
    }
  });
});

describe("T2.23 : compter les fautes", () => {
  it("critère 5 : chaque correction acceptée compte une fois", () => {
    const stats = recordMistakes(emptyMistakeStats(NOW), [
      { type: "homophone", before: "a", after: "à" },
      { type: "homophone", before: "on", after: "ont" },
      { type: "agreement", before: "enfant", after: "enfants" },
    ]);
    expect(stats.types.homophone?.count).toBe(2);
    expect(stats.types.agreement?.count).toBe(1);
    expect(totalMistakes(stats)).toBe(3);
  });

  it("critère 6 : seuls les 3 derniers exemples sont gardés, le plus récent en premier", () => {
    const stats = recordMistakes(
      emptyMistakeStats(NOW),
      ["un", "deux", "trois", "quatre"].map((word) => ({
        type: "spelling" as const,
        before: word,
        after: `${word}!`,
      })),
    );
    expect(stats.types.spelling?.count).toBe(4);
    expect(stats.types.spelling?.examples.map((example) => example.before)).toEqual([
      "quatre",
      "trois",
      "deux",
    ]);
  });

  it("critère 6 : un exemple est coupé à 40 caractères, sans couper un accent ni un emoji", () => {
    expect(truncateExample("court")).toBe("court");
    expect(truncateExample("é".repeat(40))).toBe("é".repeat(40));
    const cut = truncateExample("é".repeat(60));
    expect([...cut]).toHaveLength(40);
    expect(cut.endsWith("…")).toBe(true);
    const emojis = truncateExample("👨‍👩‍👧".repeat(50));
    expect(emojis.endsWith("👨‍👩‍👧…")).toBe(true);
    const segments = [...new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(emojis)];
    expect(segments).toHaveLength(40);
    expect(truncateExample("  espaces   autour  ")).toBe("espaces autour");
  });

  it("critère 6 : les exemples enregistrés sont coupés", () => {
    const long = "x".repeat(100);
    const stats = recordMistakes(emptyMistakeStats(NOW), [
      { type: "syntax", before: long, after: long },
    ]);
    const [example] = stats.types.syntax?.examples ?? [];
    expect([...(example?.before ?? "")]).toHaveLength(40);
    expect([...(example?.after ?? "")]).toHaveLength(40);
  });

  it("critère 14 : la remise à zéro efface tout, et la date de début repart", () => {
    const later = new Date("2026-12-01T08:00:00Z");
    const reset = emptyMistakeStats(later);
    expect(totalMistakes(reset)).toBe(0);
    expect(reset.since).toBe(later.toISOString());
    expect(paretoRows(reset)).toEqual([]);
  });

  it("critère 7 : des statistiques abîmées sont relues sans planter", () => {
    expect(readMistakeStats(null, NOW)).toEqual(emptyMistakeStats(NOW));
    expect(readMistakeStats("texte", NOW)).toEqual(emptyMistakeStats(NOW));
    const read = readMistakeStats(
      {
        since: "2026-11-01T00:00:00.000Z",
        types: {
          accent: { count: 2, examples: [{ before: "ete", after: "été" }, { before: 3 }] },
          inconnu: { count: 5, examples: [] },
          comma: "non",
          punctuation: { count: -4, examples: [] },
        },
      },
      NOW,
    );
    expect(read.since).toBe("2026-11-01T00:00:00.000Z");
    expect(read.types).toEqual({
      accent: { count: 2, examples: [{ before: "ete", after: "été" }] },
    });
    expect(readMistakeStats({ since: "pas une date", types: {} }, NOW).since).toBe(
      NOW.toISOString(),
    );
  });
});

describe("T2.23 : Pareto", () => {
  it("critère 10 : aucun type sans faute, aucune barre", () => {
    expect(paretoRows(emptyMistakeStats(NOW))).toEqual([]);
  });

  it("critère 10 : un seul type fait 100 % et il est en noir", () => {
    expect(paretoRows(statsWith({ accent: 3 }))).toEqual([
      { type: "accent", label: "Accent", count: 3, share: 1, cumulative: 1, vital: true },
    ]);
  });

  it("critère 10 : tri du plus fréquent au plus rare, cumul, et noir jusqu'à 80 %", () => {
    const rows = paretoRows(statsWith({ accent: 1, homophone: 5, agreement: 3, syntax: 1 }));
    expect(rows.map((row) => row.type)).toEqual(["homophone", "agreement", "accent", "syntax"]);
    expect(rows.map((row) => row.cumulative)).toEqual([0.5, 0.8, 0.9, 1]);
    // Homophone (50 %) et Accord (jusqu'à 80 %) font les premiers 80 %.
    expect(rows.map((row) => row.vital)).toEqual([true, true, false, false]);
  });

  it("critère 10 : le type qui franchit 80 % est en noir", () => {
    const rows = paretoRows(statsWith({ homophone: 7, agreement: 2, accent: 1 }));
    expect(rows.map((row) => row.vital)).toEqual([true, true, false]);
  });

  it("critère 10 : à égalité, l'ordre de la liste départage, aussi pour la couleur", () => {
    const rows = paretoRows(
      statsWith({ other: 1, accent: 1, agreement: 1, syntax: 1, homophone: 1 }),
    );
    expect(rows.map((row) => row.type)).toEqual([
      "agreement",
      "homophone",
      "accent",
      "syntax",
      "other",
    ]);
    // Cinq types à 20 % : les quatre premiers font 80 %, le cinquième reste en gris.
    expect(rows.map((row) => row.vital)).toEqual([true, true, true, true, false]);
    const mixed = paretoRows(statsWith({ homophone: 8, agreement: 1, accent: 1 }));
    expect(mixed.map((row) => row.vital)).toEqual([true, false, false]);
  });
});
