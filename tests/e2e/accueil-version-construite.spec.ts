// Tests d'interface du ticket H4 sur la version construite (projet « pwa » de playwright.config.ts), seule à
// avoir un service worker : l'accueil y a ses vraies durées, et la vérification de mise à jour est réelle.
import { expect, test, type Page } from "@playwright/test";
import { launchTimes, recordLaunchScreen } from "./launchTimes";

function editor(page: Page) {
  return page.getByRole("textbox", { name: "Document" });
}

/** Premier lancement : le service worker est installé et les fichiers de l'application sont en cache. */
async function installApp(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await recordLaunchScreen(page);
}

/** Durée d'affichage de l'accueil au dernier lancement, une fois retiré. */
async function welcomeDuration(page: Page): Promise<number> {
  await expect(page.locator("#nano-launch")).toHaveCount(0, { timeout: 10_000 });
  const times = await launchTimes(page);
  return times.removedAt - times.shownAt;
}

test("critère 3 : sans nouvelle version, l'accueil dure 1,5 seconde, puis le document est là, le curseur dedans", async ({
  page,
}) => {
  await installApp(page);
  await page.reload();
  await expect(page.locator("#nano-launch .nano-launch-version")).toHaveText(
    /^v\d{4}\.\d{2}\.\d{2}·/,
  );
  const duration = await welcomeDuration(page);
  expect(duration).toBeGreaterThanOrEqual(1_500);
  expect(duration).toBeLessThan(2_500);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type("Bonjour");
  await expect(editor(page)).toHaveText("Bonjour");
});

test("critère 6 : hors ligne, l'accueil dure 1,5 seconde, sans attendre le réseau", async ({
  page,
  context,
}) => {
  await installApp(page);
  await context.setOffline(true);
  await page.reload();
  const duration = await welcomeDuration(page);
  expect(duration).toBeGreaterThanOrEqual(1_500);
  // Les 3 s de la vérification ne sont pas attendues : sans réseau, elle échoue tout de suite.
  expect(duration).toBeLessThan(2_500);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type("Sans internet");
  await expect(editor(page)).toHaveText("Sans internet");
});
