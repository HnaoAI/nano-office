// Relevé, dans la page, des moments de l'écran de lancement (H4) : apparition, retrait, masquage, affichage
// de l'éditeur, retour éventuel. Un MutationObserver est installé avant le chargement de la page, pour
// voir l'écran dès qu'index.html l'écrit. Les temps sont ceux de `performance.now()` de la page.
import type { Page } from "@playwright/test";

/** Moments relevés ; -1 tant que l'événement n'a pas eu lieu. */
export interface LaunchTimes {
  /** Apparition de l'écran, notée par index.html (`data-shown-at`). */
  shownAt: number;
  /** Retrait de l'écran. */
  removedAt: number;
  /** Écran masqué sans être retiré (il ne doit jamais l'être). */
  hiddenAt: number;
  /** Premier affichage de l'éditeur. */
  editorAt: number;
  /** L'écran était là quand l'éditeur est apparu. */
  screenAtEditor: boolean;
  /** Un écran est réapparu après le retrait. */
  shownAgain: boolean;
}

type RecordingWindow = { __launchTimes?: LaunchTimes };

/** Relève les moments de l'écran aux prochains chargements de la page. */
export async function recordLaunchScreen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const times: LaunchTimes = {
      shownAt: -1,
      removedAt: -1,
      hiddenAt: -1,
      editorAt: -1,
      screenAtEditor: false,
      shownAgain: false,
    };
    (window as unknown as RecordingWindow).__launchTimes = times;
    let seen = false;
    const check = () => {
      const now = performance.now();
      const screen = document.getElementById("nano-launch");
      if (screen) {
        if (times.removedAt >= 0) times.shownAgain = true;
        if (!seen) times.shownAt = Number(screen.getAttribute("data-shown-at") ?? now);
        seen = true;
        if (times.hiddenAt < 0 && getComputedStyle(screen).display === "none") times.hiddenAt = now;
      } else if (seen && times.removedAt < 0) {
        times.removedAt = now;
      }
      if (times.editorAt < 0 && document.querySelector(".ProseMirror")) {
        times.editorAt = now;
        times.screenAtEditor = screen !== null;
      }
    };
    new MutationObserver(check).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  });
}

/** Moments relevés depuis le dernier chargement de la page. */
export async function launchTimes(page: Page): Promise<LaunchTimes> {
  const times = await page.evaluate(() => (window as unknown as RecordingWindow).__launchTimes);
  if (!times) throw new Error("relevé absent : appeler recordLaunchScreen avant le chargement");
  return times;
}
