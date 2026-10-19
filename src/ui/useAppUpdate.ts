// Hook React de la mise à jour au démarrage (ticket H1, critères 5 à 7) : enregistre le service worker
// (vite-plugin-pwa, `registerType: "prompt"`) et applique une nouvelle version seulement si
// `decideUpdate` (src/core/appUpdate.ts) le permet. Sinon, elle attend le lancement suivant.
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { decideUpdate, type LaunchActivity } from "../core/appUpdate";
import { hasReloadedForUpdate, markReloadedForUpdate } from "../storage/launchMarker";

declare global {
  interface Window {
    /** Signes de travail commencé, exposés aux tests Playwright en développement seulement. */
    __nanoLaunch?: { activity: () => LaunchActivity };
  }
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
    void applyUpdate.current?.();
  }, [updateReady, documentLoaded, activity]);

  useEffect(() => {
    if (import.meta.env.DEV) window.__nanoLaunch = { activity: () => activity };
  }, [activity]);
}
