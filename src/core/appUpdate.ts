// Décision « recharger maintenant ou attendre » quand une nouvelle version de l'application est prête
// (ticket H1, critères 5 à 8 ; H2 : un document restauré ne reporte plus la mise à jour). Logique pure : le service worker et le stockage sont dans src/ui/useAppUpdate.ts.

/**
 * Signes que l'utilisateur a commencé à travailler depuis le lancement (H1, critère 6).
 * La restauration depuis la copie de secours n'en fait plus partie (H2, décision du 2026-10-21) :
 * le document restauré est déjà en sécurité, et un rechargement le rouvre à l'identique.
 * INVARIANT : chaque signe, une fois vrai, le reste jusqu'au lancement suivant.
 */
export interface LaunchActivity {
  /** Un caractère tapé ou une mise en forme appliquée. */
  edited: boolean;
  /** Un fichier ouvert ou en cours d'ouverture (aussi : en cours d'enregistrement). */
  fileAction: boolean;
  /** La question de la copie de secours affichée. */
  backupQuestion: boolean;
}

/** Aucun travail commencé : l'état au lancement. */
export const NO_ACTIVITY: LaunchActivity = {
  edited: false,
  fileAction: false,
  backupQuestion: false,
};

/** Ce que sait l'application au moment de décider. */
export interface LaunchState {
  /** Une nouvelle version est installée et attend d'être appliquée. */
  updateReady: boolean;
  /** La copie de secours a été lue et le document (restauré ou neuf) est affiché. */
  documentLoaded: boolean;
  activity: LaunchActivity;
  /** L'application s'est déjà rechargée pour une mise à jour pendant ce lancement. */
  reloadedThisLaunch: boolean;
}

/**
 * `reload` : appliquer la nouvelle version tout de suite ; `wait` : rien à faire pour l'instant, décider
 * plus tard ; `next-launch` : la nouvelle version attend le lancement suivant (décision du 2026-10-18).
 */
export type UpdateDecision = "reload" | "wait" | "next-launch";

/**
 * Vrai si l'un des signes du critère 6 de H1 est présent. Un document restauré depuis la copie de
 * secours, sans rien d'autre, ne compte pas (H2, décision du 2026-10-21) : avant H2, il reportait la
 * mise à jour à chaque lancement, puisque le dernier document est restauré à chaque lancement (lot B).
 */
export function hasStartedWork(activity: LaunchActivity): boolean {
  return activity.edited || activity.fileAction || activity.backupQuestion;
}

/**
 * Décide s'il faut recharger l'application pour appliquer une nouvelle version (H1, critères 5 à 7).
 * INVARIANT : jamais de rechargement une fois le travail commencé, ni plus d'un par lancement,
 * ce qui empêche toute boucle de rechargement.
 */
export function decideUpdate(state: LaunchState): UpdateDecision {
  if (state.reloadedThisLaunch || hasStartedWork(state.activity)) return "next-launch";
  if (!state.updateReady || !state.documentLoaded) return "wait";
  return "reload";
}
