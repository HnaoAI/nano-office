// Écran d'accueil au N (ticket H4) : combien de temps il reste affiché à l'ouverture de l'application.
// Logique pure : le service worker, les minuteries et l'écran lui-même sont dans src/ui/useAppUpdate.ts et
// src/ui/LaunchScreen.tsx. La fenêtre « Nano Buro se met à jour » (H3) est dans src/core/appUpdate.ts.
import { UPDATE_WINDOW_TIMEOUT_MS } from "./appUpdate";

/** Durée de l'accueil sans mise à jour, comptée depuis son apparition (H4, critère 3). */
export const WELCOME_MIN_MS = 1_500;

/**
 * Attente maximale de la vérification de mise à jour, comptée depuis l'apparition de l'accueil (H4,
 * critère 3) : sans réponse (réseau lent), l'accueil se ferme quand même.
 */
export const UPDATE_CHECK_TIMEOUT_MS = 3_000;

/** Durées de l'accueil ; raccourcies pour les tests d'interface en développement (critère 9). */
export interface WelcomeTiming {
  /** Durée minimale de l'accueil. */
  minMs: number;
  /** Attente maximale de la vérification de mise à jour ; `Infinity` pour l'attendre toujours (tests). */
  checkTimeoutMs: number;
}

/** Durées de la version publiée (H4, critère 3). */
export const WELCOME_TIMING: WelcomeTiming = {
  minMs: WELCOME_MIN_MS,
  checkTimeoutMs: UPDATE_CHECK_TIMEOUT_MS,
};

/** Ce que sait l'application pendant l'accueil. */
export interface WelcomeState {
  /** Temps écoulé depuis l'apparition de l'accueil, en millisecondes. */
  elapsedMs: number;
  /** La copie de secours a été lue et le document (restauré ou vide) est affiché sous l'accueil. */
  documentLoaded: boolean;
  /**
   * La vérification de mise à jour a répondu sans mise à jour à appliquer maintenant : aucune nouvelle
   * version, hors ligne, ou une nouvelle version qui attend le lancement suivant (travail commencé…).
   * Une nouvelle version à appliquer ne la termine pas : l'accueil devient alors « se met à jour » (critère 4).
   */
  updateCheckDone: boolean;
}

/**
 * Vrai si l'accueil est terminé (H4, critère 3) : au moins 1,5 s, le document affiché, et la
 * vérification de mise à jour terminée ou attendue 3 s.
 * INVARIANT : l'application n'est jamais bloquée pour toujours ; au bout de 20 s (comme la fenêtre de
 * H3, critère 5), l'accueil est terminé quoi qu'il arrive.
 * INVARIANT : à durées fixes, une fois vrai, il le reste quand le temps passe, que le document s'affiche
 * ou que la vérification réponde : l'accueil ne revient jamais (critère 8).
 */
export function welcomeOver(state: WelcomeState, timing: WelcomeTiming = WELCOME_TIMING): boolean {
  if (state.elapsedMs >= UPDATE_WINDOW_TIMEOUT_MS) return true;
  return (
    state.documentLoaded &&
    state.elapsedMs >= timing.minMs &&
    (state.updateCheckDone || state.elapsedMs >= timing.checkTimeoutMs)
  );
}

/**
 * Temps jusqu'à la prochaine échéance de l'accueil (1,5 s, 3 s ou 20 s), pour relancer la décision.
 * @param elapsedMs temps écoulé depuis l'apparition de l'accueil
 * @returns un nombre de millisecondes strictement positif, ou null si toutes les échéances sont passées
 */
export function nextWelcomeDeadlineMs(
  elapsedMs: number,
  timing: WelcomeTiming = WELCOME_TIMING,
): number | null {
  const upcoming = [timing.minMs, timing.checkTimeoutMs, UPDATE_WINDOW_TIMEOUT_MS].filter(
    (deadline) => Number.isFinite(deadline) && deadline > elapsedMs,
  );
  return upcoming.length > 0 ? Math.min(...upcoming) - elapsedMs : null;
}

/**
 * `welcome` : accueil « Nano Buro » et la version ; `updating` : « Nano Buro se met à jour » (H3) ;
 * null : plus d'écran, l'application est libre.
 */
export type LaunchScreenMode = "welcome" | "updating" | null;

/**
 * Ce que montre l'écran de lancement (H4, critère 4) : la mise à jour l'emporte sur l'accueil, dans le
 * même écran, qui ne disparaît pas entre les deux.
 * @param welcoming vrai tant que l'accueil n'est pas terminé (`welcomeOver` faux)
 * @param updating vrai tant que la fenêtre de H3 doit être affichée
 */
export function launchScreenMode(welcoming: boolean, updating: boolean): LaunchScreenMode {
  if (updating) return "updating";
  return welcoming ? "welcome" : null;
}
