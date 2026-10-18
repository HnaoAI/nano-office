// Configuration des tests d'interface Playwright (Chromium). Tests dans tests/e2e/.
// Projet « chromium » : serveur de développement. Projet « pwa » : version construite, seule à avoir
// un service worker (T0e).
import { defineConfig, devices } from "@playwright/test";

const PWA_TESTS = "hors-ligne.spec.ts";

export default defineConfig({
  testDir: "tests/e2e",
  projects: [
    {
      name: "chromium",
      testIgnore: PWA_TESTS,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:5173" },
    },
    {
      name: "pwa",
      testMatch: PWA_TESTS,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4173" },
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
  ],
});
