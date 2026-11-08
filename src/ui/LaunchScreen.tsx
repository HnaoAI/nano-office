// Écran de lancement au N (H4) : accueil « Nano Buro » et la version, puis, s'il y a une mise à jour,
// fenêtre « Nano Buro se met à jour » (H3, critères 2, 3, 7 et 8), dans le même écran. Il est écrit dans
// index.html pour s'afficher avant le JavaScript (H4, critère 1) ; ce composant le reprend, change son
// texte et son rôle sans le recréer (le N continue de tourner), puis le retire. Le reste de la page est
// rendu inerte par App.tsx, et le clavier bloqué par updateLock.ts.
import { useLayoutEffect } from "react";
import type { LaunchScreenMode } from "../core/launchScreen";

/** Identifiant de l'écran dans index.html (aussi lu par useAppUpdate.ts pour son heure d'apparition). */
const SCREEN_ID = "nano-launch";

/** Rôle, nom et description lus par les lecteurs d'écran (H4, critère 7 ; H3, critère 8). */
function describe(box: HTMLElement, mode: "welcome" | "updating") {
  const updating = mode === "updating";
  box.setAttribute("role", updating ? "alertdialog" : "status");
  if (updating) box.setAttribute("aria-modal", "true");
  else box.removeAttribute("aria-modal");
  box.setAttribute("aria-busy", "true");
  box.setAttribute("aria-labelledby", updating ? "nano-update-title" : "nano-launch-name");
  box.setAttribute("aria-describedby", updating ? "nano-update-text" : "nano-launch-version");
}

/**
 * Tient l'écran de index.html à jour. Ne rend rien lui-même.
 * INVARIANT : une fois retiré, l'écran ne revient jamais (H4, critère 8) : ni pendant le travail, ni à
 * l'ouverture d'un fichier, ni à « Nouveau ».
 * @param mode ce que l'écran montre, ou null pour le retirer (`launchScreenMode`)
 */
export function LaunchScreen({ mode }: { mode: LaunchScreenMode }) {
  // Avant l'affichage : l'écran et la page débloquée changent dans la même image.
  useLayoutEffect(() => {
    const screen = document.getElementById(SCREEN_ID);
    if (!screen) return;
    if (mode === null) {
      screen.remove();
      return;
    }
    screen.setAttribute("data-mode", mode);
    const box = screen.querySelector<HTMLElement>(".nano-update");
    if (!box) return;
    describe(box, mode);
    // H3, critère 3 : le focus est dans l'écran, jamais dans l'éditeur derrière.
    box.focus();
  }, [mode]);
  return null;
}
