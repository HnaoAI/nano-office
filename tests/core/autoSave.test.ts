// Tests du déclenchement de la sauvegarde automatique (src/core/autoSave.ts), ticket T1.6,
// avec une horloge simulée (faux minuteurs de Vitest).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_SAVE_IDLE_MS,
  AUTO_SAVE_MAX_MS,
  AutoSaver,
  type AutoSaveRun,
} from "../../src/core/autoSave";

/** Enregistrement simulé : compte les appels ; `hold` retient la fin de l'écriture. */
function fakeRun() {
  const state = { calls: 0, hold: false, outcome: "done" as "done" | "busy" };
  let finish: (() => void) | null = null;
  const run: AutoSaveRun = () => {
    state.calls += 1;
    if (!state.hold) return Promise.resolve(state.outcome);
    return new Promise((resolve) => {
      finish = () => resolve(state.outcome);
    });
  };
  /** Termine l'écriture retenue. */
  const release = async () => {
    finish?.();
    finish = null;
    await vi.advanceTimersByTimeAsync(0);
  };
  return { state, run, release };
}

let fake: ReturnType<typeof fakeRun>;
let saver: AutoSaver;

beforeEach(() => {
  vi.useFakeTimers();
  fake = fakeRun();
  saver = new AutoSaver(fake.run);
});

afterEach(() => {
  saver.dispose();
  vi.useRealTimers();
});

describe("AutoSaver (T1.6)", () => {
  it("les délais sont de 3 secondes après la dernière modification et de 30 secondes au plus", () => {
    expect(AUTO_SAVE_IDLE_MS).toBe(3_000);
    expect(AUTO_SAVE_MAX_MS).toBe(30_000);
  });

  it("critère 1 : enregistre 3 secondes après la dernière modification", async () => {
    saver.change();
    await vi.advanceTimersByTimeAsync(2_999);
    expect(fake.state.calls).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.state.calls).toBe(1);
  });

  it("critère 1 : chaque modification repousse l'enregistrement de 3 secondes", async () => {
    saver.change();
    await vi.advanceTimersByTimeAsync(2_000);
    saver.change();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fake.state.calls).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fake.state.calls).toBe(1);
  });

  it("critère 1 : sans modification, rien n'est enregistré", async () => {
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fake.state.calls).toBe(0);
  });

  it("critère 1 : une rafale de modifications ne donne qu'un enregistrement", async () => {
    for (let i = 0; i < 50; i++) saver.change();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fake.state.calls).toBe(1);
  });

  it("critère 2 : pendant une saisie continue, un enregistrement a lieu au moins toutes les 30 secondes", async () => {
    const moments: number[] = [];
    const start = Date.now();
    saver = new AutoSaver(() => {
      moments.push(Date.now() - start);
      return Promise.resolve("done");
    });
    // Une frappe par seconde pendant 95 secondes : jamais 3 secondes de calme.
    for (let second = 0; second < 95; second++) {
      saver.change();
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(moments).toEqual([30_000, 60_000, 90_000]);
  });

  it("critère 2 : le maximum de 30 secondes repart de la première modification après un enregistrement", async () => {
    saver.change();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fake.state.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    // Nouvelle saisie continue : le maximum se compte depuis sa première frappe, pas depuis le lancement.
    for (let second = 0; second < 29; second++) {
      saver.change();
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(fake.state.calls).toBe(1);
    saver.change();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fake.state.calls).toBe(2);
  });

  it("critère 6 : pas de deuxième sauvegarde automatique pendant que la première écrit", async () => {
    fake.state.hold = true;
    saver.change();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fake.state.calls).toBe(1);
    // Saisie pendant l'écriture : son délai expire avant la fin de l'écriture.
    saver.change();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fake.state.calls).toBe(1);
    fake.state.hold = false;
    await fake.release();
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_IDLE_MS);
    expect(fake.state.calls).toBe(2);
  });

  it("critère 6 : un enregistrement manuel en cours fait réessayer 3 secondes plus tard, sans écrire en même temps", async () => {
    fake.state.outcome = "busy";
    saver.change();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fake.state.calls).toBe(1);
    fake.state.outcome = "done";
    await vi.advanceTimersByTimeAsync(2_999);
    expect(fake.state.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.state.calls).toBe(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.state.calls).toBe(2);
  });

  it("critère 5 : après un échec, la sauvegarde automatique ne réessaie pas en boucle", async () => {
    saver.change();
    await vi.advanceTimersByTimeAsync(3_000);
    saver.reportResult("failed");
    expect(saver.paused).toBe(true);
    for (let second = 0; second < 120; second++) {
      saver.change();
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(fake.state.calls).toBe(1);
  });

  it("critère 5 : un échec annule la sauvegarde automatique déjà prévue", async () => {
    saver.change();
    await vi.advanceTimersByTimeAsync(1_000);
    saver.reportResult("failed");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.state.calls).toBe(0);
  });

  it("critère 5 : la sauvegarde automatique reprend après un enregistrement réussi", async () => {
    saver.reportResult("failed");
    saver.change();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fake.state.calls).toBe(0);
    saver.reportResult("saved");
    expect(saver.paused).toBe(false);
    saver.change();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fake.state.calls).toBe(1);
  });

  it("pause() suspend la sauvegarde automatique jusqu'au prochain enregistrement réussi", async () => {
    saver.pause();
    saver.change();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fake.state.calls).toBe(0);
    saver.reportResult("saved");
    saver.change();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fake.state.calls).toBe(1);
  });

  it("dispose() annule la sauvegarde prévue : rien n'est écrit pour un document qui n'est plus affiché", async () => {
    saver.change();
    saver.dispose();
    saver.change();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.state.calls).toBe(0);
  });

  it("une exception de l'enregistrement ne bloque pas les suivants", async () => {
    let calls = 0;
    saver = new AutoSaver(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("panne")) : Promise.resolve("done");
    });
    saver.change();
    await vi.advanceTimersByTimeAsync(3_000);
    saver.change();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(calls).toBe(2);
  });
});

describe("AutoSaver : reprise et attente (T1.6, relecture)", () => {
  it("critère 5 : une modification faite pendant la pause est enregistrée après la reprise, sans nouvelle frappe", async () => {
    saver.reportResult("failed");
    saver.change();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fake.state.calls).toBe(0);
    saver.reportResult("saved");
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_IDLE_MS);
    expect(fake.state.calls).toBe(1);
  });

  it("une reprise sans modification manquée n'écrit rien", async () => {
    saver.reportResult("failed");
    saver.reportResult("saved");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.state.calls).toBe(0);
  });

  it("hold() empêche toute écriture, même déjà prévue, jusqu'à release()", async () => {
    saver.change();
    await vi.advanceTimersByTimeAsync(1_000);
    saver.hold();
    saver.change();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.state.calls).toBe(0);
    saver.release();
    await vi.advanceTimersByTimeAsync(AUTO_SAVE_IDLE_MS);
    expect(fake.state.calls).toBe(1);
  });

  it("release() sans modification pendant l'attente n'écrit rien", async () => {
    saver.hold();
    saver.release();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.state.calls).toBe(0);
  });

  it("release() ne lève pas une pause due à un échec", async () => {
    saver.reportResult("failed");
    saver.hold();
    saver.change();
    saver.release();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.state.calls).toBe(0);
  });

  it("après dispose(), release() n'écrit rien", async () => {
    saver.hold();
    saver.change();
    saver.dispose();
    saver.release();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.state.calls).toBe(0);
  });
});
