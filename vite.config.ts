// Configuration de Vite (application et PWA) et de Vitest (tests de logique, sans navigateur).
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // Application installable et hors ligne (T0e) : manifeste et service worker, générés au build
    // seulement. Le service worker ne met en cache que les fichiers de l'application ; les documents
    // ne passent jamais par le réseau.
    VitePWA({
      // « prompt » sans message : une nouvelle version attend la fermeture de toutes les fenêtres
      // de l'application, puis s'applique au lancement suivant. « autoUpdate » rechargerait la page
      // en pleine édition. Le message « mise à jour disponible » est hors périmètre de T0e.
      registerType: "prompt",
      injectRegister: "script-defer",
      manifest: {
        name: "Nano Office",
        short_name: "Nano Office",
        description: "Traitement de texte sobre, qui fonctionne sans connexion internet.",
        lang: "fr",
        display: "standalone",
        start_url: "/",
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
        // woff2 : les polices intégrées (U1a) s'affichent hors ligne. Les .woff de secours de
        // Fontsource ne sont pas mis en cache : Chrome, Edge, Safari et Firefox lisent tous le woff2.
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,woff2}"],
      },
    }),
  ],
  test: {
    // Les tests de logique tournent dans Node, sans DOM (ticket T0a).
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
  },
});
