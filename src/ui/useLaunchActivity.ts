// Signes de travail commencé depuis le lancement (H1, critère 6), pour la mise à jour au démarrage.
// Découpé de useDocumentFile.ts (M1), sans changement.
import { useCallback, useState } from "react";
import { NO_ACTIVITY, type LaunchActivity } from "../core/appUpdate";
import { cancelReloadForUpdate } from "./useAppUpdate";

/**
 * Signes de travail commencé.
 * @returns `activity`, les signes retenus ; `noteActivity`, qui en retient un ; `noteFileAction`,
 *   raccourci stable pour une action sur un fichier ou une boîte ouverte
 */
export function useLaunchActivity() {
  const [activity, setActivity] = useState<LaunchActivity>(NO_ACTIVITY);

  /** Retient un signe de travail commencé (H1, critère 6) ; il reste vrai jusqu'au lancement suivant. */
  const noteActivity = useCallback((sign: keyof LaunchActivity) => {
    // Synchrone : un rechargement de mise à jour déjà décidé est annulé avant tout rendu (H2).
    cancelReloadForUpdate();
    setActivity((current) => (current[sign] ? current : { ...current, [sign]: true }));
  }, []);

  // Stable : DocumentEditor le donne à la configuration de l'éditeur, créée une fois par document.
  const noteFileAction = useCallback(() => noteActivity("fileAction"), [noteActivity]);

  return { activity, noteActivity, noteFileAction };
}
