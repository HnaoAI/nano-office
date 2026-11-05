// Statistiques de « Mes fautes » gardées sur cet ordinateur (T2.23, critères 7 et 14).
import { describe, expect, it } from "vitest";
import { emptyMistakeStats, recordMistakes } from "../../src/core/mistakes";
import {
  loadMistakeStats,
  MISTAKE_STATS_KEY,
  saveMistakeStats,
} from "../../src/storage/mistakeStatsStore";

const NOW = new Date("2026-11-05T10:00:00Z");

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe("T2.23 : statistiques sur l'ordinateur", () => {
  it("critère 7 : sans statistiques, un compte vide qui commence aujourd'hui", () => {
    expect(loadMistakeStats(NOW, memoryStorage())).toEqual(emptyMistakeStats(NOW));
    expect(loadMistakeStats(NOW, null)).toEqual(emptyMistakeStats(NOW));
  });

  it("critère 7 : les statistiques sont retenues sous leur propre entrée, et relues", () => {
    const storage = memoryStorage();
    const stats = recordMistakes(emptyMistakeStats(NOW), [
      { type: "homophone", before: "a", after: "à" },
    ]);
    saveMistakeStats(stats, storage);
    expect([...storage.values.keys()]).toEqual([MISTAKE_STATS_KEY]);
    expect(loadMistakeStats(new Date(), storage)).toEqual(stats);
  });

  it("critère 14 : « Remettre à zéro » enregistre un compte vide, avec une nouvelle date de début", () => {
    const storage = memoryStorage();
    saveMistakeStats(
      recordMistakes(emptyMistakeStats(NOW), [{ type: "accent", before: "ete", after: "été" }]),
      storage,
    );
    const later = new Date("2026-12-24T09:00:00Z");
    saveMistakeStats(emptyMistakeStats(later), storage);
    expect(loadMistakeStats(new Date(), storage)).toEqual(emptyMistakeStats(later));
  });

  it("un stockage abîmé ou refusé ne casse rien", () => {
    const storage = memoryStorage();
    storage.values.set(MISTAKE_STATS_KEY, "{pas du json");
    expect(loadMistakeStats(NOW, storage)).toEqual(emptyMistakeStats(NOW));
    const refusing = {
      getItem: () => {
        throw new Error("refusé");
      },
      setItem: () => {
        throw new Error("plein");
      },
    };
    expect(loadMistakeStats(NOW, refusing)).toEqual(emptyMistakeStats(NOW));
    expect(() => saveMistakeStats(emptyMistakeStats(NOW), refusing)).not.toThrow();
  });
});
