// Tests d'interface du ticket H1 (publication sur GitHub Pages), dans Chromium, sur la version construite
// avec BASE_PATH=/nano-office/ et servie sous ce sous-dossier (projet Playwright « pages »), comme sur
// https://hnaoai.github.io/nano-office/.
import { expect, test, type Page } from "@playwright/test";
import { suspiciousTraffic, watchNetwork } from "./networkWatch";

const BASE = "/nano-office/";

function editor(page: Page) {
  return page.getByRole("textbox", { name: "Document" });
}

async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

test("critère 3 : sous /nano-office/, l'application reste installable (manifeste et service worker trouvés sous ce chemin)", async ({
  page,
}) => {
  await page.goto(BASE);
  await waitForServiceWorker(page);

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifestUrl = new URL(manifestHref ?? "", page.url());
  expect(manifestUrl.pathname.startsWith(BASE)).toBe(true);
  const response = await page.request.get(manifestUrl.href);
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as {
    start_url: string;
    scope: string;
    icons: { src: string }[];
  };
  expect(manifest.start_url).toBe("./");
  expect(manifest.scope).toBe("./");
  for (const icon of manifest.icons) {
    expect((await page.request.get(new URL(icon.src, manifestUrl).href)).ok()).toBe(true);
  }

  const scriptUrl = await page.evaluate(
    async () => (await navigator.serviceWorker.ready).active?.scriptURL ?? "",
  );
  expect(new URL(scriptUrl).pathname.startsWith(BASE)).toBe(true);

  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  const errors = installabilityErrors.map((error) => error.errorId);
  expect(errors.filter((id) => id !== "in-incognito")).toEqual([]);
});

test("critère 2 : sous /nano-office/, l'application fonctionne hors ligne après un premier chargement", async ({
  page,
  context,
}) => {
  await page.goto(BASE);
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.reload();
  await editor(page).click();
  await page.keyboard.type("Écrit sans internet 😀");
  await expect(editor(page)).toContainText("Écrit sans internet 😀");
});

test("critère 4 : sous /nano-office/, aucune donnée de document n'est envoyée sur le réseau", async ({
  page,
  baseURL,
}) => {
  const log = watchNetwork(page);
  await page.goto(BASE);
  await waitForServiceWorker(page);
  await editor(page).click();
  const text = "Liste de courses de la famille 🔒";
  await page.keyboard.type(text);
  await expect(editor(page)).toContainText(text);
  expect(suspiciousTraffic(log, new URL(baseURL ?? page.url()).origin, text)).toEqual([]);
});

test("critère 10 : la version construite affiche v<date>·<commit court> sous le nom, et dans le titre survolé", async ({
  page,
}) => {
  await page.goto(BASE);
  const version = page.locator(".nano-brand .nano-version");
  await expect(version).toHaveText(/^v\d{4}\.\d{2}\.\d{2}·([0-9a-f]{7}|inconnu)$/);
  const text = await version.textContent();
  await expect(version).toHaveAttribute("title", `Version de Nano Buro : ${text}`);
});
