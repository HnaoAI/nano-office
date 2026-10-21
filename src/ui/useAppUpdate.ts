// Hook React de la mise à jour au démarrage (ticket H1, critères 5 à 7) : enregistre le service worker
// (vite-plugin-pwa, `registerType: "prompt"`) et applique une nouvelle version seulement si
// `decideUpdate` (src/core/appUpdate.ts) le permet. Sinon, elle attend le lancement suivant.
// Indique aussi à l'alerte avant fermeture (useBackup.ts) que la page se recharge pour une mise à jour (H2).
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { decideUpdate, hasStartedWork, type LaunchActivity } from "../core/appUpdate";
import { hasReloadedForUpdate, markReloadedForUpdate } from "../storage/launchMarker";

declare global {
  interface Window {
    /** Exposé aux tests Playwright en développement seulement. */
    __nanoLaunch?: {
      /** Signes de travail commencé depuis le lancement. */
      activity: () => LaunchActivity;
      /** Fait comme si une nouvelle version était prête : rechargement si `decideUpdate` le permet (H2). */
      simulateUpdate: () => void;
    };
  }
}

/** Vrai entre la décision de recharger pour une mise à jour et le rechargement lui-même (H2). */
let reloadingForUpdate = false;

/**
 * Vrai si la page se recharge pour appliquer une nouvelle version, sans travail commencé (H2).
 * L'alerte avant fermeture n'est alors pas affichée : un document restauré a des modifications non
 * enregistrées dans le fichier, mais elles sont dans la copie de secours, et le rechargement le restaure.
 * INVARIANT : redevient faux dès qu'un signe de travail commencé apparaît, même si le rechargement
 * n'a pas encore eu lieu (le service worker peut tarder à prendre la main).
 */
export function isReloadingForUpdate(): boolean {
  return reloadingForUpdate;
}

/**
 * Applique une nouvelle version au lancement, tant que l'utilisateur n'a pas commencé à travailler.
 * INVARIANT : la page n'est jamais rechargée une fois le travail commencé, y compris quand une autre
 * fenêtre de l'application installe la nouvelle version (`onNeedReload`).
 * @param activity signes de travail commencé depuis le lancement (critère 6)
 * @param documentLoaded faux pendant la lecture de la copie de secours
 */
export function useAppUpdate(activity: LaunchActivity, documentLoaded: boolean) {
  const [updateReady, setUpdateReady] = useState(false);
  const applyUpdate = useRef<(() => Promise<void>) | null>(null);
  const applying = useRef(false);

  const decide = useEffectEvent((ready: boolean) =>
    decideUpdate({
      updateReady: ready,
      documentLoaded,
      activity,
      reloadedThisLaunch: hasReloadedForUpdate(),
    }),
  );

  const reloadIfAllowed = useEffectEvent(() => {
    if (applying.current) {
      window.location.reload();
    } else if (decide(true) === "reload" && markReloadedForUpdate()) {
      // Une autre fenêtre a installé la nouvelle version et celle-ci n'a rien de commencé.
      reloadingForUpdate = true;
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
    if (applying.current || decide(updateReady) !== "reload") return;
    // Le souvenir est écrit avant le rechargement ; s'il ne peut pas l'être, on attend le lancement suivant.
    if (!markReloadedForUpdate()) return;
    applying.current = true;
    reloadingForUpdate = true;
    void applyUpdate.current?.();
  }, [updateReady, documentLoaded, activity]);

  // Travail commencé avant le rechargement : l'alerte avant fermeture protège de nouveau (H2).
  useEffect(() => {
    if (hasStartedWork(activity)) reloadingForUpdate = false;
  }, [activity]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__nanoLaunch = {
      activity: () => activity,
      // Même chemin qu'en production : `onNeedRefresh`, puis `updateSW(true)`, qui recharge la page.
      simulateUpdate: () => {
        applyUpdate.current = () => Promise.resolve(window.location.reload());
        setUpdateReady(true);
      },
    };
  }, [activity]);
}
