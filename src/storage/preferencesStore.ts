// Réglages de l'éditeur (T2.21, copie automatique de la sélection), dans le localStorage de ce
// navigateur, sur cet ordinateur. Jamais dans le document, la copie de secours ni le fichier `.nano`.
import { DEFAULT_EDITOR_PREFERENCES, type EditorPreferences } from "../core/preferences";

/** Entrée des réglages. Préfixe technique « nano-office », comme les copies de secours (R1). */
export const PREFERENCES_KEY = "nano-office:preferences";

/** Stockage utilisé ; `localStorage` dans l'application, un faux dans les tests. */
type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Stockage bloqué par le navigateur (navigation privée stricte) : réglages par défaut.
    return null;
  }
}

/**
 * Réglages enregistrés, ou ceux par défaut s'il n'y en a pas ou s'ils sont illisibles : un réglage
 * abîmé n'allume jamais la copie automatique.
 */
export function loadPreferences(
  storage: KeyValueStorage | null = defaultStorage(),
): EditorPreferences {
  try {
    const text = storage?.getItem(PREFERENCES_KEY);
    const saved = text ? (JSON.parse(text) as unknown) : null;
    if (saved === null || typeof saved !== "object") return { ...DEFAULT_EDITOR_PREFERENCES };
    return { autoCopySelection: (saved as Record<string, unknown>).autoCopySelection === true };
  } catch {
    return { ...DEFAULT_EDITOR_PREFERENCES };
  }
}

/** Enregistre les réglages ; un stockage plein ou bloqué est ignoré (valables jusqu'à la fermeture). */
export function savePreferences(
  preferences: EditorPreferences,
  storage: KeyValueStorage | null = defaultStorage(),
): void {
  try {
    storage?.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ autoCopySelection: preferences.autoCopySelection }),
    );
  } catch {
    // Rien à faire : le réglage sera seulement oublié au prochain lancement.
  }
}
