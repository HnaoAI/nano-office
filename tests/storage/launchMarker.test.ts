// @vitest-environment jsdom
// Tests du souvenir « message mis à jour » (src/storage/launchMarker.ts), ticket H3 : l'heure d'apparition
// de la fenêtre traverse le rechargement, pour la garder affichée au moins 5 secondes en tout (critère 1).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearUpdateNotice,
  markUpdateNotice,
  takeUpdateNotice,
} from "../../src/storage/launchMarker";

describe("souvenir de la fenêtre de mise à jour (H3)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("critère 1 : l'heure d'apparition de la fenêtre est retrouvée après le rechargement", () => {
    markUpdateNotice();
    expect(takeUpdateNotice()).toBe(1_800_000_000_000);
  });

  it("critère 6 : le souvenir est effacé à la lecture, et après un déblocage", () => {
    markUpdateNotice();
    takeUpdateNotice();
    expect(takeUpdateNotice()).toBeNull();
    markUpdateNotice();
    clearUpdateNotice();
    expect(takeUpdateNotice()).toBeNull();
  });

  it("critère 1 : un souvenir illisible compte comme une fenêtre déjà assez vue, sans bloquer", () => {
    sessionStorage.setItem("nano-office-update-notice", "pas une heure");
    expect(takeUpdateNotice()).toBe(0);
  });
});
