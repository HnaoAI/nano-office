// Plan ouvert ou fermé, retenu sur cet ordinateur (T2.9, critère 1).
import { describe, expect, it } from "vitest";
import {
  loadOutlineOpen,
  OUTLINE_OPEN_KEY,
  saveOutlineOpen,
} from "../../src/storage/outlinePreference";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe("T2.9 : choix du plan retenu", () => {
  it("critère 1 : le plan est fermé par défaut", () => {
    expect(loadOutlineOpen(memoryStorage())).toBe(false);
    expect(loadOutlineOpen(null)).toBe(false);
  });

  it("critère 1 : le choix ouvert ou fermé est retenu", () => {
    const storage = memoryStorage();
    saveOutlineOpen(true, storage);
    expect(storage.values.get(OUTLINE_OPEN_KEY)).toBe("true");
    expect(loadOutlineOpen(storage)).toBe(true);
    saveOutlineOpen(false, storage);
    expect(loadOutlineOpen(storage)).toBe(false);
  });

  it("cas limite : une valeur abîmée ou un stockage bloqué laissent le plan fermé, sans erreur", () => {
    const storage = memoryStorage();
    storage.values.set(OUTLINE_OPEN_KEY, "{oui");
    expect(loadOutlineOpen(storage)).toBe(false);
    const blocked = {
      getItem: () => {
        throw new Error("bloqué");
      },
      setItem: () => {
        throw new Error("plein");
      },
    };
    expect(loadOutlineOpen(blocked)).toBe(false);
    expect(() => saveOutlineOpen(true, blocked)).not.toThrow();
  });
});
