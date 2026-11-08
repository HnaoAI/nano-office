// Hook React de la mise à jour au démarrage (ticket H1, critères 5 à 7) : enregistre le service worker
// (vite-plugin-pwa, `registerType: "prompt"`) et applique une nouvelle version seulement si
// `decideUpdate` (src/core/appUpdate.ts) le permet. Sinon, elle attend le lancement suivant.
// Indique aussi à l'alerte avant fermeture (useBackup.ts) que la page se recharge pour une mise à jour (H2).
// H3 : fenêtre « Nano Buro se met à jour » qui bloque l'application du choix de recharger jusqu'à
// l'affichage de la nouvelle version, et au moins 5 s en tout (ou 20 s au plus), puis message « mis à jour ».
// H4 : écran d'accueil à chaque ouverture, 1,5 s, en attendant la vérification de mise à jour 3 s au plus ;
// une mise à jour n'est appliquée que pendant l'accueil, qui devient alors la fenêtre de H3.
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import {
  decideUpdate,
  showsUpdateWindow,
  startUpdateWatchdog,
  updateWindowRemainingMs,
  type LaunchActivity,
} from "../core/appUpdate";
import {
  launchScreenMode,
  nextWelcomeDeadlineMs,
  WELCOME_TIMING,
  welcomeOver,
  type WelcomeTiming,
} from "../core/launchScreen";
import {
  clearUpdateNotice,
  hasReloadedForUpdate,
  markReloadedForUpdate,
  markUpdateNotice,
  takeUpdateNotice,
} from "../storage/launchMarker";
import { APP_VERSION } from "./appVersion";
import { updatedNotice } from "./updateTexts";
import { setKeyboardLocked } from "./updateLock";

declare global {
  interface Window {
    /** Exposé aux tests Playwright en développement seulement. */
    __nanoLaunch?: {
      /** Signes de travail commencé depuis le lancement. */
      activity: () => LaunchActivity;
      /**
       * Fait comme si une nouvelle version était prête (H2). Avec `holdControl`, la nouvelle version ne
       * prend la main qu'à l'appel de `takeControl`, comme l'événement `controlling` du service worker.
       */
      simulateUpdate: (options?: { holdControl?: boolean }) => void;
      /** Prise de main retenue par `simulateUpdate({ holdControl: true })`, ou null. */
      takeControl: (() => void) | null;
      /** Termine sans mise à jour une vérification retenue par `__nanoWelcome.holdUpdateCheck` (H4). */
      finishUpdateCheck: () => void;
    };
    /**
     * Réglage de l'accueil pour les tests Playwright (H4, critère 9), lu au chargement, en développement
     * seulement. Sans lui, l'accueil se ferme dès que le document est affiché, pour ne pas ralentir
     * chaque test de 1,5 s. `real` : les vraies durées (1,5 s, 3 s). `holdUpdateCheck` : la vérification
     * de mise à jour attend `simulateUpdate` ou `finishUpdateCheck`, sans limite si `real` est absent.
     */
    __nanoWelcome?: { real?: boolean; holdUpdateCheck?: boolean };
  }
}

/** Réglage de l'accueil des tests (critère 9), jamais lu dans la version construite. */
const WELCOME_OPTIONS =
  import.meta.env.DEV && typeof window !== "undefined" ? (window.__nanoWelcome ?? {}) : {};
const HOLD_UPDATE_CHECK = WELCOME_OPTIONS.holdUpdateCheck === true;

/** Durées de l'accueil : celles de H4 dans la version construite, raccourcies pour les tests (critère 9). */
const TIMING: WelcomeTiming =
  !import.meta.env.DEV || WELCOME_OPTIONS.real
    ? WELCOME_TIMING
    : { minMs: 0, checkTimeoutMs: HOLD_UPDATE_CHECK ? Infinity : 0 };

/**
 * Cherche une nouvelle version sur le serveur (H4, critère 3).
 * @returns vrai si une nouvelle version est prête ou en cours de téléchargement : `onNeedRefresh` suivra ;
 *   faux s'il n'y en a pas, au premier lancement (rien à remplacer) ou sans réseau (critère 6)
 */
async function findUpdate(registration: ServiceWorkerRegistration | undefined): Promise<boolean> {
  if (!registration) return false;
  if (registration.waiting) return true;
  try {
    await registration.update();
  } catch {
    return false;
  }
  return (
    registration.waiting !== null ||
    (registration.installing !== null && registration.active !== null)
  );
}

/**
 * Vrai de la décision de recharger pour une mise à jour (effet principal ou `onNeedReload`) jusqu'au
 * rechargement, tant que rien n'est commencé (H2).
 */
let reloadingForUpdate = false;

/**
 * Vrai si la page se recharge pour appliquer une nouvelle version, sans travail commencé (H2).
 * L'alerte avant fermeture n'est alors pas affichée : un document restauré a des modifications non
 * enregistrées dans le fichier, mais elles sont dans la copie de secours, et le rechargement le restaure.
 */
export function isReloadingForUpdate(): boolean {
  return reloadingForUpdate;
}

/**
 * Annule un rechargement de mise à jour décidé mais pas encore fait (H2, relecture). À appeler de façon
 * synchrone à chaque signe de travail commencé (`useDocumentFile`), avant le prochain rendu.
 * INVARIANT : après cet appel, la page ne se recharge plus pour cette mise à jour, et l'alerte avant
 * fermeture protège de nouveau les modifications (le service worker peut tarder à prendre la main).
 */
export function cancelReloadForUpdate(): void {
  reloadingForUpdate = false;
}

/**
 * Heure d'apparition de la fenêtre si cette page vient d'être rechargée pour une mise à jour (H3), sinon
 * null. Lu une seule fois, au chargement du module : React appelle deux fois les initialiseurs d'état en
 * développement (StrictMode). La fenêtre reste alors affichée, et le clavier bloqué, jusqu'à l'affichage
 * du document et au moins 5 s après son apparition (critère 1).
 */
const UPDATE_SHOWN_AT = typeof window !== "undefined" ? takeUpdateNotice() : null;
const RELOADED_FOR_UPDATE = UPDATE_SHOWN_AT !== null;
/**
 * Heure d'apparition de l'écran de lancement (H4), en millisecondes depuis l'ouverture de la page
 * (`performance.now()`), notée par index.html ; 0, l'ouverture de la page, si elle manque.
 */
function launchScreenShownAt(): number {
  if (typeof document === "undefined") return 0;
  const shownAt = Number(document.getElementById("nano-launch")?.getAttribute("data-shown-at"));
  return Number.isFinite(shownAt) ? shownAt : 0;
}
const LAUNCH_SHOWN_AT = launchScreenShownAt();
// H4, critère 5 : bloqué dès le chargement, pendant l'accueil comme pendant la mise à jour (H3).
setKeyboardLocked(true);

/**
 * Applique une nouvelle version au lancement, tant que l'utilisateur n'a pas commencé à travailler.
 * INVARIANT : la page n'est jamais rechargée une fois le travail commencé, y compris quand une autre
 * fenêtre de l'application installe la nouvelle version (`onNeedReload`).
 * @param activity signes de travail commencé depuis le lancement (critère 6)
 * @param documentLoaded faux pendant la lecture de la copie de secours
 * @param reloadKeepsDocument vrai si un rechargement rouvrirait le document affiché (H2)
 * @returns `screen`, ce que montre l'écran de lancement (accueil de H4 ou fenêtre « se met à jour » de
 *   H3), null quand l'application est libre ; `notice`, le message « mis à jour » à afficher, ou null ;
 *   `dismissNotice`, qui le ferme
 */
export function useAppUpdate(
  activity: LaunchActivity,
  documentLoaded: boolean,
  reloadKeepsDocument: () => boolean,
) {
  const [updateReady, setUpdateReady] = useState(false);
  const applyUpdate = useRef<(() => Promise<void>) | null>(null);
  const applying = useRef(false);
  const heldControl = useRef<(() => void) | null>(null);
  // H3 : fenêtre affichée avant le rechargement ; délai dépassé après lui ; message fermé.
  const [applyingWindow, setApplyingWindow] = useState(false);
  const [finishTimedOut, setFinishTimedOut] = useState(false);
  const [minShown, setMinShown] = useState(
    () => UPDATE_SHOWN_AT === null || updateWindowRemainingMs(UPDATE_SHOWN_AT, Date.now()) === 0,
  );
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  // H4 : vérification de mise à jour terminée (pas de service worker en développement), et heure
  // relue à chaque échéance de l'accueil (1,5 s, 3 s, 20 s).
  const [updateCheckDone, setUpdateCheckDone] = useState(
    () => !import.meta.env.PROD && !HOLD_UPDATE_CHECK,
  );
  const [now, setNow] = useState(() => performance.now());
  // Après un rechargement de mise à jour, pas d'accueil : la fenêtre de H3 continue.
  const welcoming =
    !RELOADED_FOR_UPDATE &&
    !welcomeOver({ elapsedMs: now - LAUNCH_SHOWN_AT, documentLoaded, updateCheckDone }, TIMING);

  const decide = useEffectEvent((ready: boolean) =>
    decideUpdate({
      updateReady: ready,
      documentLoaded,
      activity,
      reloadKeepsDocument: reloadKeepsDocument(),
      reloadedThisLaunch: hasReloadedForUpdate(),
      welcomeOver: !welcoming,
    }),
  );

  const reloadIfAllowed = useEffectEvent(() => {
    if (applying.current) {
      // La nouvelle version prend la main. Si l'utilisateur a commencé à travailler entre-temps, la page
      // n'est pas rechargée : la nouvelle version s'applique au lancement suivant (H2, relecture).
      if (reloadingForUpdate) window.location.reload();
    } else if (decide(true) === "reload" && markReloadedForUpdate()) {
      // Une autre fenêtre a installé la nouvelle version et celle-ci n'a rien de commencé. Le rechargement
      // est immédiat : la fenêtre de H3 s'affiche seulement sur la page rechargée.
      reloadingForUpdate = true;
      markUpdateNotice();
      window.location.reload();
    }
  });

  // Le service worker n'existe que dans la version construite (T0e).
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    applyUpdate.current = registerSW({
      // H4 : la vérification commence dès le chargement du script, sans attendre la fin de la page.
      immediate: true,
      onNeedRefresh: () => setUpdateReady(true),
      onRegisteredSW: (_url, registration) => {
        void findUpdate(registration).then((found) => {
          if (!found) setUpdateCheckDone(true);
        });
      },
      onRegisterError: () => setUpdateCheckDone(true),
      // Remplace le rechargement automatique de vite-plugin-pwa, qui ne regarde pas le travail en cours.
      onNeedReload: () => reloadIfAllowed(),
    });
  }, []);

  useEffect(() => {
    if (applying.current) return;
    const decision = decide(updateReady);
    // Le souvenir est écrit avant le rechargement ; s'il ne peut pas l'être, on attend le lancement suivant.
    if (!showsUpdateWindow(decision) || !markReloadedForUpdate()) {
      // H4 : une nouvelle version qui attend le lancement suivant ne retient pas l'accueil.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (updateReady && decision !== "wait") setUpdateCheckDone(true);
      return;
    }
    applying.current = true;
    reloadingForUpdate = true;
    // H3, critères 1 et 3 : la fenêtre s'affiche et bloque tout avant le rechargement. La décision est
    // prise dans cet effet, seul endroit où elle peut l'être : l'état suit donc ici.
    markUpdateNotice();
    setKeyboardLocked(true);
    setApplyingWindow(true);
    void applyUpdate.current?.();
  }, [updateReady, documentLoaded, activity, welcoming]);

  // H4, critère 3 : à chaque échéance de l'accueil, l'heure est relue pour décider s'il se ferme.
  useEffect(() => {
    if (!welcoming) return;
    const elapsed = performance.now() - LAUNCH_SHOWN_AT;
    const wait = nextWelcomeDeadlineMs(elapsed, TIMING);
    if (wait === null) return;
    // Une minuterie peut se déclencher une fraction de milliseconde avant l'heure mesurée par
    // `performance.now()` : l'heure retenue est au moins l'échéance, pour ne jamais la manquer.
    const deadline = LAUNCH_SHOWN_AT + elapsed + wait;
    const timer = setTimeout(() => setNow(Math.max(performance.now(), deadline)), wait);
    return () => clearTimeout(timer);
  }, [welcoming, now]);

  // H3, critère 1 : après le rechargement, la fenêtre reste jusqu'à l'affichage du document, et au moins
  // 5 s depuis son apparition. Le délai de 20 s (critère 5) l'emporte toujours.
  const finishing = RELOADED_FOR_UPDATE && (!documentLoaded || !minShown) && !finishTimedOut;
  const updating = applyingWindow || finishing;
  const screen = launchScreenMode(welcoming, updating);
  // H3, critère 6 : le message « mis à jour » remplace alors la fenêtre.
  const notice =
    RELOADED_FOR_UPDATE && documentLoaded && !finishing && !noticeDismissed
      ? updatedNotice(APP_VERSION)
      : null;

  useEffect(() => {
    if (minShown || UPDATE_SHOWN_AT === null) return;
    const timer = setTimeout(
      () => setMinShown(true),
      updateWindowRemainingMs(UPDATE_SHOWN_AT, Date.now()),
    );
    return () => clearTimeout(timer);
  }, [minShown]);

  // Avant l'affichage, comme le retrait de l'écran (LaunchScreen.tsx) : jamais une page libre au clavier bloqué.
  const blocked = screen !== null;
  useLayoutEffect(() => {
    setKeyboardLocked(blocked);
  }, [blocked]);

  // H3, critère 5 : jamais bloqué pour toujours. Au bout de 20 s, la fenêtre se ferme avec la version
  // actuelle ; une prise de main tardive ne recharge plus la page, et la mise à jour attend le lancement suivant.
  useEffect(() => {
    if (!applyingWindow) return;
    return startUpdateWatchdog(() => {
      cancelReloadForUpdate();
      clearUpdateNotice();
      setKeyboardLocked(false);
      setApplyingWindow(false);
      // H4 : l'accueil, commencé avant la fenêtre, est fini lui aussi ; l'écran se retire sans revenir à l'accueil.
      setUpdateCheckDone(true);
      setNow(performance.now());
    });
  }, [applyingWindow]);

  useEffect(() => {
    if (!RELOADED_FOR_UPDATE) return;
    return startUpdateWatchdog(() => setFinishTimedOut(true));
  }, []);

  // H3, critère 6 : le message disparaît seul à la première frappe.
  useEffect(() => {
    if (!notice) return;
    const dismiss = () => setNoticeDismissed(true);
    window.addEventListener("keydown", dismiss, { once: true });
    return () => window.removeEventListener("keydown", dismiss);
  }, [notice]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__nanoLaunch = {
      activity: () => activity,
      // Comme en production : `onNeedRefresh`, puis `updateSW(true)`, puis `controlling`, qui appelle
      // `onNeedReload`. Seuls le service worker et `skipWaiting` sont absents.
      simulateUpdate: ({ holdControl = false } = {}) => {
        applyUpdate.current = () => {
          if (holdControl) heldControl.current = () => reloadIfAllowed();
          else reloadIfAllowed();
          return Promise.resolve();
        };
        setUpdateReady(true);
      },
      get takeControl() {
        return heldControl.current;
      },
      finishUpdateCheck: () => setUpdateCheckDone(true),
    };
  }, [activity]);

  return { screen, notice, dismissNotice: () => setNoticeDismissed(true) };
}
