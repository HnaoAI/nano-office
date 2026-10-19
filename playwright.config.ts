// Configuration des tests d'interface Playwright (Chromium). Tests dans tests/e2e/.
// Projet « chromium » : serveur de développement. Projet « pwa » : version construite, seule à avoir
// un service worker (T0e). Projet « pages » : version construite avec BASE_PATH=/nano-office/ et servie
// sous ce sous-dossier, comme sur GitHub Pages (H1).
import { defineConfig, devices } from "@playwright/test";

const PWA_TESTS = "hors-ligne.spec.ts";
const PAGES_TESTS = "publication.spec.ts";
const PAGES_ENV = { BASE_PATH: "/nano-office/" };

export default defineConfig({
  testDir: "tests/e2e",
  projects: [
    {
      name: "chromium",
      testIgnore: [PWA_TESTS, PAGES_TESTS],
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:5173" },
    },
    {
      name: "pwa",
      testMatch: PWA_TESTS,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4173" },
    },
    {
      name: "pages",
      testMatch: PAGES_TESTS,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4174" },
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run build && npx vite preview --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      // Dossier dist-pages : ne remplace pas la construction du projet « pwa », lancée en même temps.
      command:
        "npx vite build --outDir dist-pages && npx vite preview --outDir dist-pages --port 4174 --strictPort",
      url: "http://localhost:4174/nano-office/",
      env: PAGES_ENV,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
