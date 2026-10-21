// Configuration de Vite (application et PWA) et de Vitest (tests de logique, sans navigateur).
import { execSync } from "node:child_process";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { DEV_VERSION, formatVersion } from "./src/core/appVersion.ts";

/**
 * Commit construit (H1, critère 10) : `APP_COMMIT` (fixé par l'Action de publication), sinon
 * `GITHUB_SHA` (CI), sinon `git rev-parse` en local. Vide si aucun n'est disponible.
 */
function buildCommit(): string {
  const fromEnv = process.env.APP_COMMIT ?? process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv;
  try {
    return execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

export default defineConfig(({ command }) => ({
  // Sous-dossier de publication (H1, critère 3) : `BASE_PATH=/nano-office/` pour GitHub Pages.
  // Sans la variable, l'application reste à la racine (`npm run dev`, `npm run build`, tests).
  base: process.env.BASE_PATH ?? "/",
  define: {
    // Version affichée sous le nom de l'application (H1, critères 10 à 12), lue par src/ui/appVersion.ts.
    __APP_VERSION__: JSON.stringify(
      command === "serve" ? DEV_VERSION : formatVersion(new Date(), buildCommit()),
    ),
  },
  // L'export Word (T2.7) charge `docx` à la demande : sans cette ligne, le serveur de développement
  // découvrirait la bibliothèque au premier export et rechargerait la page en pleine édition.
  optimizeDeps: { include: ["docx"] },
  plugins: [
    react(),
    // Application installable et hors ligne (T0e) : manifeste et service worker, générés au build
    // seulement. Le service worker ne met en cache que les fichiers de l'application ; les documents
    // ne passent jamais par le réseau.
    VitePWA({
      // « prompt » sans message : une nouvelle version n'est appliquée au lancement que si
      // l'utilisateur n'a pas commencé à travailler (H1), sinon au lancement suivant. « autoUpdate »
      // rechargerait la page en pleine édition. L'enregistrement du service worker est fait par
      // src/ui/useAppUpdate.ts, qui prend cette décision.
      registerType: "prompt",
      injectRegister: false,
      manifest: {
        name: "Nano Buro",
        short_name: "Nano Buro",
        description: "Traitement de texte sobre, qui fonctionne sans connexion internet.",
        lang: "fr",
        display: "standalone",
        // Chemins relatifs au manifeste : l'application s'installe aussi sous /nano-office/ (H1, critère 3).
        start_url: "./",
        scope: "./",
        background_color: "#ffffff",
        theme_color: "#2b5797",
        // Icônes provisoires : les icônes définitives sont hors périmètre de T0e.
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        // woff2 : les polices intégrées (U1a) s'affichent hors ligne. Des .woff de Fontsource, seuls
        // ceux des polices du document en normal, gras et italique (400 et 700) sont mis en cache : l'export
        // Word les convertit pour les embarquer (T2.7, src/ui/wordAssets.ts), même hors ligne.
        globPatterns: [
          "**/*.{js,css,html,svg,png,webmanifest,woff2}",
          "**/*-latin-{400,700}-{normal,italic}-*.woff",
        ],
      },
    }),
  ],
  test: {
    // Les tests de logique tournent dans Node, sans DOM (ticket T0a).
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
  },
}));
