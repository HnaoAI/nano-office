// Réglage « Copier automatiquement la sélection », retenu sur cet ordinateur (T2.21, critères 1 et 6).
import { describe, expect, it } from "vitest";
import {
  loadPreferences,
  PREFERENCES_KEY,
  savePreferences,
} from "../../src/storage/preferencesStore";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe("T2.21 : réglage de la copie automatique", () => {
  it("critère 1 : la copie automatique est éteinte au départ", () => {
    expect(loadPreferences(memoryStorage()).autoCopySelection).toBe(false);
    expect(loadPreferences(null).autoCopySelection).toBe(false);
  });

  it("critère 6 : le réglage est retenu sur cet ordinateur", () => {
    const storage = memoryStorage();
    savePreferences({ autoCopySelection: true }, storage);
    expect(storage.values.has(PREFERENCES_KEY)).toBe(true);
    expect(loadPreferences(storage).autoCopySelection).toBe(true);
    savePreferences({ autoCopySelection: false }, storage);
    expect(loadPreferences(storage).autoCopySelection).toBe(false);
  });

  it("un réglage abîmé ou d'un autre type n'allume jamais la copie automatique", () => {
    for (const text of ["{", "null", '"true"', '{"autoCopySelection":"true"}', "[]"]) {
      const storage = memoryStorage();
      storage.values.set(PREFERENCES_KEY, text);
      expect(loadPreferences(storage).autoCopySelection).toBe(false);
    }
  });

  it("critère 7 : un stockage refusé ne casse rien", () => {
    const refusing = {
      getItem: () => {
        throw new Error("refusé");
      },
      setItem: () => {
        throw new Error("plein");
      },
    };
    expect(() => savePreferences({ autoCopySelection: true }, refusing)).not.toThrow();
    expect(loadPreferences(refusing).autoCopySelection).toBe(false);
  });
});
