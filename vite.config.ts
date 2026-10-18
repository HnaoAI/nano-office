// Configuration de Vite (application) et de Vitest (tests de logique, sans navigateur).
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // Les tests de logique tournent dans Node, sans DOM (ticket T0a).
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
  },
});
