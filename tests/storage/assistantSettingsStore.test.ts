// Tests des réglages de l'assistant (src/storage/assistantSettingsStore.ts, T3.1, critères 1, 3 et 4) :
// valeurs par défaut, réglages abîmés, clé rangée à part, « Oublier la clé ».
import { describe, expect, it } from "vitest";
import { DEFAULT_MODELS } from "../../src/core/assistant";
import {
  ASSISTANT_KEYS_KEY,
  ASSISTANT_SETTINGS_KEY,
  forgetAssistantKeys,
  loadAssistantKeys,
  loadAssistantSettings,
  saveAssistantKeys,
  saveAssistantSettings,
} from "../../src/storage/assistantSettingsStore";

/** Faux localStorage en mémoire. */
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe("T3.1 : réglages de l'assistant", () => {
  it("critère 4 : sans réglage, l'assistant est éteint, avec les modèles par défaut", () => {
    const settings = loadAssistantSettings(memoryStorage());
    expect(settings).toEqual({ enabled: false, provider: "anthropic", models: DEFAULT_MODELS });
  });

  it("critère 4 : des réglages abîmés n'allument jamais l'assistant", () => {
    const storage = memoryStorage();
    storage.setItem(ASSISTANT_SETTINGS_KEY, "{pas du json");
    expect(loadAssistantSettings(storage).enabled).toBe(false);
    storage.setItem(ASSISTANT_SETTINGS_KEY, JSON.stringify({ enabled: "oui", provider: "autre" }));
    expect(loadAssistantSettings(storage)).toMatchObject({ enabled: false, provider: "anthropic" });
  });

  it("critère 1 : fournisseur et modèle choisis sont relus ; un modèle vide reprend celui par défaut", () => {
    const storage = memoryStorage();
    saveAssistantSettings(
      { enabled: true, provider: "gemini", models: { anthropic: " ", gemini: "gemini-perso" } },
      storage,
    );
    expect(loadAssistantSettings(storage)).toEqual({
      enabled: true,
      provider: "gemini",
      models: { anthropic: DEFAULT_MODELS.anthropic, gemini: "gemini-perso" },
    });
  });

  it("critère 3 : la clé est rangée à part, jamais avec les réglages", () => {
    const storage = memoryStorage();
    saveAssistantSettings(
      { enabled: true, provider: "anthropic", models: DEFAULT_MODELS },
      storage,
    );
    saveAssistantKeys({ anthropic: "sk-ant-secret" }, storage);
    expect(storage.values.get(ASSISTANT_SETTINGS_KEY)).not.toContain("sk-ant-secret");
    expect(loadAssistantKeys(storage)).toEqual({ anthropic: "sk-ant-secret" });
  });

  it("critère 3 : « Oublier la clé » efface toutes les clés", () => {
    const storage = memoryStorage();
    saveAssistantKeys({ anthropic: "sk-ant-secret", gemini: "AIza-secret" }, storage);
    forgetAssistantKeys(storage);
    expect(storage.values.has(ASSISTANT_KEYS_KEY)).toBe(false);
    expect(loadAssistantKeys(storage)).toEqual({});
  });

  it("critère 3 : une clé vide n'est pas gardée", () => {
    const storage = memoryStorage();
    saveAssistantKeys({ anthropic: "  " }, storage);
    expect(storage.values.has(ASSISTANT_KEYS_KEY)).toBe(false);
  });

  it("sans stockage disponible, les réglages par défaut s'appliquent sans plantage", () => {
    expect(loadAssistantSettings(null).enabled).toBe(false);
    expect(loadAssistantKeys(null)).toEqual({});
    expect(() => saveAssistantKeys({ anthropic: "x" }, null)).not.toThrow();
  });
});
