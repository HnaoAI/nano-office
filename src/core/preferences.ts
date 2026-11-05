// Réglages de l'éditeur gardés sur cet ordinateur, hors assistant : copie automatique de la sélection
// (T2.21). Logique pure ; la lecture et l'écriture sont dans src/storage/preferencesStore.ts.

/** Réglages de l'éditeur de cet ordinateur. Jamais dans un fichier `.nano` (T2.21, critère 6). */
export interface EditorPreferences {
  /** Copier tout seul le texte sélectionné à la souris (T2.21) ; éteint par défaut (critère 1). */
  autoCopySelection: boolean;
}

/** Réglages d'un ordinateur où rien n'a été réglé. */
export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  autoCopySelection: false,
};
