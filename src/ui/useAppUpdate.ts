// Hook React de la mise à jour au démarrage (ticket H1, critères 5 à 7) : enregistre le service worker
// (vite-plugin-pwa, `registerType: "prompt"`) et applique une nouvelle version seulement si
// `decideUpdate` (src/core/appUpdate.ts) le permet. Sinon, elle attend le lancement suivant.
// Indique aussi à l'alerte avant fermeture (useBackup.ts) que la page se recharge pour une mise à jour (H2).
// H3 : fenêtre « Nano Buro se met à jour » qui bloque l'application du choix de recharger jusqu'à
// l'affichage de la nouvelle version (ou 20 s au plus), puis message « mis à jour ».
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import {
  decideUpdate,
  showsUpdateWindow,
  startUpdateWatchdog,
  type LaunchActivity,
} from "../core/appUpdate";
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
    };
  }
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
 * Vrai si cette page vient d'être rechargée pour une mise à jour (H3). Lu une seule fois, au chargement
 * du module : React appelle deux fois les initialiseurs d'état en développement (StrictMode).
 * La fenêtre reste alors affichée, et le clavier bloqué, jusqu'à l'affichage du document (critère 1).
 */
const RELOADED_FOR_UPDATE = typeof window !== "undefined" && takeUpdateNotice();
setKeyboardLocked(RELOADED_FOR_UPDATE);

/**
 * Applique une nouvelle version au lancement, tant que l'utilisateur n'a pas commencé à travailler.
 * INVARIANT : la page n'est jamais rechargée une fois le travail commencé, y compris quand une autre
 * fenêtre de l'application installe la nouvelle version (`onNeedReload`).
 * @param activity signes de travail commencé depuis le lancement (critère 6)
 * @param documentLoaded faux pendant la lecture de la copie de secours
 * @param reloadKeepsDocument vrai si un rechargement rouvrirait le document affiché (H2)
 * @returns `updating`, vrai tant que la fenêtre « se met à jour » est affichée et l'application bloquée
 *   (H3) ; `notice`, le message « mis à jour » à afficher, ou null ; `dismissNotice`, qui le ferme
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
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  const decide = useEffectEvent((ready: boolean) =>
    decideUpdate({
      updateReady: ready,
      documentLoaded,
      activity,
      reloadKeepsDocument: reloadKeepsDocument(),
      reloadedThisLaunch: hasReloadedForUpdate(),
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
      onNeedRefresh: () => setUpdateReady(true),
      // Remplace le rechargement automatique de vite-plugin-pwa, qui ne regarde pas le travail en cours.
      onNeedReload: () => reloadIfAllowed(),
    });
  }, []);

  useEffect(() => {
    if (applying.current || !showsUpdateWindow(decide(updateReady))) return;
    // Le souvenir est écrit avant le rechargement ; s'il ne peut pas l'être, on attend le lancement suivant.
    if (!markReloadedForUpdate()) return;
    applying.current = true;
    reloadingForUpdate = true;
    // H3, critères 1 et 3 : la fenêtre s'affiche et bloque tout avant le rechargement. La décision est
    // prise dans cet effet, seul endroit où elle peut l'être : l'état suit donc ici.
    markUpdateNotice();
    setKeyboardLocked(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApplyingWindow(true);
    void applyUpdate.current?.();
  }, [updateReady, documentLoaded, activity]);

  // H3, critère 1 : après le rechargement, la fenêtre reste jusqu'à l'affichage du document.
  const finishing = RELOADED_FOR_UPDATE && !documentLoaded && !finishTimedOut;
  const updating = applyingWindow || finishing;
  // H3, critère 6 : le message « mis à jour » remplace alors la fenêtre.
  const notice =
    RELOADED_FOR_UPDATE && documentLoaded && !noticeDismissed ? updatedNotice(APP_VERSION) : null;

  useEffect(() => {
    setKeyboardLocked(updating);
  }, [updating]);

  // H3, critère 5 : jamais bloqué pour toujours. Au bout de 20 s, la fenêtre se ferme avec la version
  // actuelle ; une prise de main tardive ne recharge plus la page, et la mise à jour attend le lancement suivant.
  useEffect(() => {
    if (!applyingWindow) return;
    return startUpdateWatchdog(() => {
      cancelReloadForUpdate();
      clearUpdateNotice();
      setKeyboardLocked(false);
      setApplyingWindow(false);
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
    };
  }, [activity]);

  return { updating, notice, dismissNotice: () => setNoticeDismissed(true) };
}
