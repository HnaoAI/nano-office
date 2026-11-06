// Hook React des réglages de l'éditeur de cet ordinateur (T2.21, copie automatique de la sélection) :
// lus au lancement, enregistrés par la boîte « Réglages » (src/storage/preferencesStore.ts).
import { useCallback, useState } from "react";
import type { EditorPreferences } from "../core/preferences";
import { loadPreferences, savePreferences } from "../storage/preferencesStore";

/**
 * Réglages de l'éditeur de cet ordinateur, communs à tous les documents.
 * @returns `preferences` et `save`, qui les enregistre sur cet ordinateur
 */
export function usePreferences() {
  const [preferences, setPreferences] = useState<EditorPreferences>(() => loadPreferences());
  const save = useCallback((next: EditorPreferences) => {
    savePreferences(next);
    setPreferences(next);
  }, []);
  return { preferences, save };
}
