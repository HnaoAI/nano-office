// Aides des tests Playwright de l'écran d'accueil (H4), partagées avec les tests de mise à jour (H2, H3).
// En développement, l'accueil se ferme dès que le document est affiché (critère 9) ; ces aides le
// retiennent ou lui rendent ses vraies durées, par `window.__nanoWelcome` (src/ui/useAppUpdate.ts).
import type { Page } from "@playwright/test";

/**
 * Aux prochains chargements de la page, l'accueil attend la vérification de mise à jour, sans limite :
 * une nouvelle version simulée par `__nanoLaunch.simulateUpdate` est alors trouvée pendant l'accueil,
 * comme au lancement réel (H4, critère 4). `finishUpdateCheck` le termine sans mise à jour.
 * @param real vraies durées : 1,5 s au moins, vérification attendue 3 s au plus (critère 3)
 */
export async function holdWelcome(page: Page, real = false): Promise<void> {
  await page.addInitScript((useReal) => {
    window.__nanoWelcome = { holdUpdateCheck: true, real: useReal };
  }, real);
}

/** Aux prochains chargements de la page, l'accueil a ses vraies durées (H4, critère 9). */
export async function realWelcome(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__nanoWelcome = { real: true };
  });
}
