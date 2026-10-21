// Réglages de l'assistant (T3.1) et clés d'API, dans le localStorage de ce navigateur, sur cet ordinateur.
// INVARIANT : les clés sont rangées à part, sous leur propre entrée. Elles n'entrent jamais dans un
// fichier `.nano`, dans la copie de secours (IndexedDB) ni dans le Y.Doc (critère 3).
import {
  DEFAULT_ASSISTANT_SETTINGS,
  DEFAULT_MODELS,
  type AssistantProviderId,
  type AssistantSettings,
} from "../core/assistant";

/** Entrée des réglages. Préfixe technique « nano-office », comme les copies de secours (R1). */
export const ASSISTANT_SETTINGS_KEY = "nano-office:assistant-settings";

/** Entrée des clés d'API, une par fournisseur, à part des réglages. */
export const ASSISTANT_KEYS_KEY = "nano-office:assistant-keys";

/** Clés d'API saisies par l'utilisateur, par fournisseur. */
export type AssistantKeys = Partial<Record<AssistantProviderId, string>>;

/** Stockage utilisé ; `localStorage` dans l'application, un faux dans les tests. */
type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Stockage bloqué par le navigateur (navigation privée stricte) : réglages par défaut.
    return null;
  }
}

function readJson(storage: KeyValueStorage | null, key: string): unknown {
  try {
    const text = storage?.getItem(key);
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

function isProvider(value: unknown): value is AssistantProviderId {
  return value === "anthropic" || value === "gemini";
}

function modelOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

/**
 * Réglages enregistrés, ou ceux par défaut (assistant éteint) s'il n'y en a pas ou s'ils sont
 * illisibles : un réglage abîmé n'allume jamais l'assistant.
 */
export function loadAssistantSettings(
  storage: KeyValueStorage | null = defaultStorage(),
): AssistantSettings {
  const saved = readJson(storage, ASSISTANT_SETTINGS_KEY);
  if (saved === null || typeof saved !== "object") return { ...DEFAULT_ASSISTANT_SETTINGS };
  const { enabled, provider, models } = saved as Record<string, unknown>;
  const savedModels = (models && typeof models === "object" ? models : {}) as Record<
    string,
    unknown
  >;
  return {
    enabled: enabled === true,
    provider: isProvider(provider) ? provider : DEFAULT_ASSISTANT_SETTINGS.provider,
    models: {
      anthropic: modelOr(savedModels.anthropic, DEFAULT_MODELS.anthropic),
      gemini: modelOr(savedModels.gemini, DEFAULT_MODELS.gemini),
    },
  };
}

/** Enregistre les réglages (sans aucune clé). */
export function saveAssistantSettings(
  settings: AssistantSettings,
  storage: KeyValueStorage | null = defaultStorage(),
): void {
  const { enabled, provider, models } = settings;
  storage?.setItem(ASSISTANT_SETTINGS_KEY, JSON.stringify({ enabled, provider, models }));
}

/** Clés d'API enregistrées. */
export function loadAssistantKeys(
  storage: KeyValueStorage | null = defaultStorage(),
): AssistantKeys {
  const saved = readJson(storage, ASSISTANT_KEYS_KEY);
  if (saved === null || typeof saved !== "object") return {};
  const keys: AssistantKeys = {};
  for (const provider of ["anthropic", "gemini"] as const) {
    const value = (saved as Record<string, unknown>)[provider];
    if (typeof value === "string" && value.trim() !== "") keys[provider] = value.trim();
  }
  return keys;
}

/** Enregistre les clés d'API ; sans aucune clé, l'entrée est effacée. */
export function saveAssistantKeys(
  keys: AssistantKeys,
  storage: KeyValueStorage | null = defaultStorage(),
): void {
  const kept = Object.fromEntries(
    Object.entries(keys).filter(([, value]) => typeof value === "string" && value.trim() !== ""),
  );
  if (Object.keys(kept).length === 0) storage?.removeItem(ASSISTANT_KEYS_KEY);
  else storage?.setItem(ASSISTANT_KEYS_KEY, JSON.stringify(kept));
}

/** « Oublier la clé » : efface toutes les clés d'API de cet ordinateur (critère 3). */
export function forgetAssistantKeys(storage: KeyValueStorage | null = defaultStorage()): void {
  storage?.removeItem(ASSISTANT_KEYS_KEY);
}
