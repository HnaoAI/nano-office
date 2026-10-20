// Tests d'interface du ticket T0e (application installable et hors ligne), dans Chromium.
// Ils tournent sur la version construite (`npm run build` puis `vite preview`, projet « pwa » de
// playwright.config.ts), car le service worker n'existe pas sur le serveur de développement.
import { expect, test, type Page } from "@playwright/test";
import { suspiciousTraffic, watchNetwork } from "./networkWatch";

function editor(page: Page) {
  return page.getByRole("textbox", { name: "Document" });
}

/** Attend que le service worker soit actif, donc que les fichiers de l'application soient en cache. */
async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

test("critère 1 : npm run build produit une version installable (manifeste et service worker)", async ({
  page,
}) => {
  await page.goto("/");
  await waitForServiceWorker(page);

  const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestUrl).not.toBeNull();
  const manifest = (await (await page.request.get(manifestUrl ?? "")).json()) as {
    name: string;
    short_name: string;
    display: string;
  };
  expect(manifest.name).toBe("Nano Buro");
  // R1 critère 3 : le nom court (Dock, Spotlight, barre des tâches) et le titre de index.html.
  expect(manifest.short_name).toBe("Nano Buro");
  expect(await (await page.request.get("/")).text()).toContain("<title>Nano Buro</title>");
  expect(manifest.display).toBe("standalone");

  // Chrome indique lui-même ce qui empêcherait l'installation (protocole DevTools).
  // « in-incognito » est ignoré : Playwright ouvre toujours une fenêtre privée, où Chrome refuse
  // toute installation, quelle que soit l'application.
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  const errors = installabilityErrors.map((error) => error.errorId);
  expect(errors.filter((id) => id !== "in-incognito")).toEqual([]);
});

test("critère 2 : après un premier chargement, l'application s'ouvre et fonctionne sans connexion internet", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await waitForServiceWorker(page);

  await context.setOffline(true);
  await page.reload();
  await editor(page).click();
  await page.keyboard.type("Écrit sans internet 😀");
  await page.keyboard.press("ControlOrMeta+B");
  await page.keyboard.type(" en gras");

  await expect(editor(page)).toContainText("Écrit sans internet 😀 en gras");
  await expect(editor(page).locator("strong")).toHaveText(" en gras");
});

test("critère 3 : dans la version construite, aucune donnée de document n'est envoyée sur le réseau pendant l'édition", async ({
  page,
  baseURL,
}) => {
  const log = watchNetwork(page);
  await page.goto("/");
  await waitForServiceWorker(page);
  await editor(page).click();
  const text = "Journal intime de la famille, à ne pas partager 🔒";
  await page.keyboard.type(text);
  await expect(editor(page)).toContainText(text);

  expect(suspiciousTraffic(log, new URL(baseURL ?? page.url()).origin, text)).toEqual([]);
});

test("U1a, critère 6 : sans connexion internet, les polices IBM Plex intégrées s'affichent toujours", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await waitForServiceWorker(page);

  await context.setOffline(true);
  await page.reload();
  await expect(editor(page)).toBeVisible();
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((font) => font.status === "loaded")
      .map((font) => font.family.replace(/"/g, ""));
  });
  expect(loaded).toEqual(expect.arrayContaining(["IBM Plex Sans", "IBM Plex Mono"]));
});

test("T1.4, critère 7 : sans connexion internet, les cinq polices du document s'affichent, graisses comprises", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await waitForServiceWorker(page);

  await context.setOffline(true);
  await page.reload();
  await editor(page).click();
  const fonts = [
    "IBM Plex Sans",
    "IBM Plex Serif",
    "IBM Plex Mono",
    "Source Sans 3",
    "EB Garamond",
  ];
  for (const [index, font] of fonts.entries()) {
    if (index > 0) await page.keyboard.press("Enter");
    await page.getByRole("combobox", { name: "Police" }).selectOption(font);
    await page.keyboard.type(`${font} `);
    await page.keyboard.press("ControlOrMeta+B");
    await page.keyboard.type("gras");
    await page.keyboard.press("ControlOrMeta+B");
  }
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((font) => font.status === "loaded")
      .map((font) => `${font.family.replace(/"/g, "")} ${font.weight}`);
  });
  for (const font of fonts) {
    expect(loaded).toContain(`${font} 400`);
    expect(loaded).toContain(`${font} 700`);
  }
});
