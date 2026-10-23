// Décision « recharger maintenant ou attendre » quand une nouvelle version de l'application est prête
// (ticket H1, critères 5 à 8 ; H2 : un document restauré ne reporte plus la mise à jour), et fenêtre
// « Nano Buro se met à jour » avec son délai de 20 s (H3). Logique pure : le service worker et le
// stockage sont dans src/ui/useAppUpdate.ts.

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
  /**
   * Un rechargement rouvrirait le document affiché (H2, relecture) : il n'a pas de modifications non
   * enregistrées, ou c'est lui que la copie de secours restaurera. Faux si une autre fenêtre a modifié
   * un autre document depuis : le rechargement afficherait celui-là à la place.
   */
  reloadKeepsDocument: boolean;
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
  if (!state.reloadKeepsDocument) return "next-launch";
  return "reload";
}

/**
 * Délai au-delà duquel la fenêtre « Nano Buro se met à jour » se ferme et débloque l'application avec
 * la version actuelle (H3, critère 5) : service worker bloqué, ou connexion perdue pendant le téléchargement.
 */
export const UPDATE_WINDOW_TIMEOUT_MS = 20_000;

/**
 * Vrai si la fenêtre « Nano Buro se met à jour » doit s'afficher (H3, critères 1 et 4) : seulement quand
 * la mise à jour au lancement est décidée, donc jamais une fois le travail commencé.
 */
export function showsUpdateWindow(decision: UpdateDecision): boolean {
  return decision === "reload";
}

/**
 * Lance le délai de la fenêtre de mise à jour (H3, critère 5).
 * INVARIANT : l'application n'est jamais bloquée pour toujours ; `onGiveUp` est appelé une seule fois,
 * au bout de `timeoutMs`, sauf si la fonction renvoyée a été appelée avant.
 * @param onGiveUp ferme la fenêtre et débloque l'application ; la mise à jour attend le lancement suivant
 * @returns arrête le délai (nouvelle version affichée) ; sans effet après le déblocage
 */
export function startUpdateWatchdog(
  onGiveUp: () => void,
  timeoutMs: number = UPDATE_WINDOW_TIMEOUT_MS,
): () => void {
  const timer = setTimeout(onGiveUp, timeoutMs);
  return () => clearTimeout(timer);
}
