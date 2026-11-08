// Vérifie que l'écran de lancement écrit dans index.html (H4, critère 1) reprend les textes de la fenêtre
// de mise à jour (src/ui/updateTexts.ts, H3) et la clé du souvenir de rechargement (src/storage/launchMarker.ts).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UPDATE_REASSURANCE, UPDATE_TITLE } from "../../src/ui/updateTexts";

// Espaces et retours à la ligne de Prettier ramenés à rien autour des balises.
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8")
  .replace(/>\s+/g, ">")
  .replace(/\s+</g, "<");
const marker = readFileSync(new URL("../../src/storage/launchMarker.ts", import.meta.url), "utf8");

describe("écran de lancement de index.html (H4)", () => {
  it("critère 4 : les textes de la mise à jour sont ceux de la fenêtre de H3", () => {
    expect(html).toContain(`<h2 id="nano-update-title">${UPDATE_TITLE}</h2>`);
    expect(html).toContain(`<p id="nano-update-text">${UPDATE_REASSURANCE}</p>`);
  });

  it("critère 2 : sous le N, « Nano Buro » et la version, remplacée à la construction", () => {
    expect(html).toContain('<h2 id="nano-launch-name">Nano Buro</h2>');
    expect(html).toContain(">__APP_VERSION__</p>");
  });

  it("critère 4 : après un rechargement de mise à jour, index.html lit le même souvenir que l'application", () => {
    const key = /NOTICE_KEY = "([^"]+)"/.exec(marker)?.[1];
    expect(key).toBeDefined();
    expect(html).toContain(`sessionStorage.getItem("${key}")`);
  });
});
