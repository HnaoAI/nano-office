// Tests de la fenêtre « Nano Buro se met à jour » (src/core/appUpdate.ts), ticket H3 : quand l'afficher,
// et le déblocage au bout de 20 secondes, avec une horloge simulée.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  showsUpdateWindow,
  startUpdateWatchdog,
  UPDATE_WINDOW_TIMEOUT_MS,
  type UpdateDecision,
} from "../../src/core/appUpdate";

describe("showsUpdateWindow (H3)", () => {
  it("critère 1 : la fenêtre s'affiche quand la mise à jour au lancement est décidée (`reload`)", () => {
    expect(showsUpdateWindow("reload")).toBe(true);
  });

  it("critère 4 : jamais de fenêtre une fois le travail commencé, ni sans nouvelle version (`next-launch`, `wait`)", () => {
    const others: UpdateDecision[] = ["wait", "next-launch"];
    for (const decision of others) expect(showsUpdateWindow(decision)).toBe(false);
  });
});

describe("startUpdateWatchdog (H3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("critère 5 : le délai est de 20 secondes", () => {
    expect(UPDATE_WINDOW_TIMEOUT_MS).toBe(20_000);
  });

  it("critère 5 : sans nouvelle version affichée au bout de 20 s, Nano Buro se débloque", () => {
    const giveUp = vi.fn();
    startUpdateWatchdog(giveUp);
    vi.advanceTimersByTime(UPDATE_WINDOW_TIMEOUT_MS - 1);
    expect(giveUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(giveUp).toHaveBeenCalledTimes(1);
  });

  it("critère 5 : une seule tentative : le déblocage n'a lieu qu'une fois, même longtemps après", () => {
    const giveUp = vi.fn();
    startUpdateWatchdog(giveUp);
    vi.advanceTimersByTime(10 * UPDATE_WINDOW_TIMEOUT_MS);
    expect(giveUp).toHaveBeenCalledTimes(1);
  });

  it("critère 1 : arrêté avant 20 s (nouvelle version affichée), il ne débloque rien", () => {
    const giveUp = vi.fn();
    const stop = startUpdateWatchdog(giveUp);
    vi.advanceTimersByTime(5_000);
    stop();
    vi.advanceTimersByTime(UPDATE_WINDOW_TIMEOUT_MS);
    expect(giveUp).not.toHaveBeenCalled();
  });

  it("cas limite : l'arrêter deux fois, ou après le déblocage, ne fait rien", () => {
    const giveUp = vi.fn();
    const stop = startUpdateWatchdog(giveUp);
    vi.advanceTimersByTime(UPDATE_WINDOW_TIMEOUT_MS);
    stop();
    stop();
    expect(giveUp).toHaveBeenCalledTimes(1);
  });
});
