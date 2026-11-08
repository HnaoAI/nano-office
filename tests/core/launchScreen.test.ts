// Tests de l'écran d'accueil au N (src/core/launchScreen.ts), ticket H4 : durée de 1,5 s, attente de la
// vérification de mise à jour 3 s au plus, déblocage au bout de 20 s, passage à « se met à jour » sans
// disparaître, et aucune mise à jour appliquée après l'accueil (src/core/appUpdate.ts).
import { describe, expect, it } from "vitest";
import { decideUpdate, NO_ACTIVITY, UPDATE_WINDOW_TIMEOUT_MS } from "../../src/core/appUpdate";
import {
  launchScreenMode,
  nextWelcomeDeadlineMs,
  UPDATE_CHECK_TIMEOUT_MS,
  WELCOME_MIN_MS,
  welcomeOver,
  type WelcomeState,
} from "../../src/core/launchScreen";

/** Accueil ordinaire : document affiché, vérification terminée sans mise à jour. */
function at(elapsedMs: number, overrides: Partial<WelcomeState> = {}): WelcomeState {
  return { elapsedMs, documentLoaded: true, updateCheckDone: true, ...overrides };
}

describe("welcomeOver (H4)", () => {
  it("critère 3 : sans mise à jour, l'accueil dure 1,5 seconde", () => {
    expect(WELCOME_MIN_MS).toBe(1_500);
    expect(welcomeOver(at(0))).toBe(false);
    expect(welcomeOver(at(1_499))).toBe(false);
    expect(welcomeOver(at(1_500))).toBe(true);
  });

  it("critère 3 : l'accueil attend que le document restauré ou vide soit affiché", () => {
    expect(welcomeOver(at(1_500, { documentLoaded: false }))).toBe(false);
    expect(welcomeOver(at(5_000, { documentLoaded: false }))).toBe(false);
  });

  it("critère 3 : la vérification de mise à jour est attendue au plus jusqu'à 3 secondes", () => {
    expect(UPDATE_CHECK_TIMEOUT_MS).toBe(3_000);
    const slow = { updateCheckDone: false };
    expect(welcomeOver(at(1_500, slow))).toBe(false);
    expect(welcomeOver(at(2_999, slow))).toBe(false);
    expect(welcomeOver(at(3_000, slow))).toBe(true);
  });

  it("critère 3 : une vérification qui répond avant 1,5 s ne raccourcit pas l'accueil", () => {
    expect(welcomeOver(at(200))).toBe(false);
  });

  it("critère 6 : hors ligne, la vérification échoue tout de suite et l'accueil dure 1,5 seconde", () => {
    // Hors ligne, la vérification répond aussitôt (échec réseau) : c'est une vérification terminée.
    expect(welcomeOver(at(1_500, { updateCheckDone: true }))).toBe(true);
  });

  it("jamais bloqué pour toujours : au bout de 20 s, l'accueil est terminé, même sans document", () => {
    const stuck = { documentLoaded: false, updateCheckDone: false };
    expect(welcomeOver(at(UPDATE_WINDOW_TIMEOUT_MS - 1, stuck))).toBe(false);
    expect(welcomeOver(at(UPDATE_WINDOW_TIMEOUT_MS, stuck))).toBe(true);
    expect(
      welcomeOver(at(UPDATE_WINDOW_TIMEOUT_MS, stuck), { minMs: 0, checkTimeoutMs: Infinity }),
    ).toBe(true);
  });

  it("critère 9 : des durées raccourcies (tests en développement) ferment l'accueil dès que le document est là", () => {
    const short = { minMs: 0, checkTimeoutMs: 0 };
    expect(welcomeOver(at(0, { updateCheckDone: false }), short)).toBe(true);
    expect(welcomeOver(at(0, { documentLoaded: false }), short)).toBe(false);
    // Vérification retenue par le test : l'accueil l'attend sans limite de 3 s.
    const held = { minMs: 0, checkTimeoutMs: Infinity };
    expect(welcomeOver(at(10_000, { updateCheckDone: false }), held)).toBe(false);
  });

  it("critère 8 : une fois terminé, l'accueil ne revient jamais quand le temps passe", () => {
    for (const documentLoaded of [false, true])
      for (const updateCheckDone of [false, true]) {
        let over = false;
        for (let elapsedMs = 0; elapsedMs <= 25_000; elapsedMs += 250) {
          const now = welcomeOver({ elapsedMs, documentLoaded, updateCheckDone });
          if (over) expect(now).toBe(true);
          over = now;
        }
        expect(over).toBe(true);
      }
  });
});

describe("nextWelcomeDeadlineMs (H4)", () => {
  it("critère 3 : relance la décision à 1,5 s, 3 s puis 20 s", () => {
    expect(nextWelcomeDeadlineMs(0)).toBe(1_500);
    expect(nextWelcomeDeadlineMs(1_000)).toBe(500);
    expect(nextWelcomeDeadlineMs(1_500)).toBe(1_500);
    expect(nextWelcomeDeadlineMs(3_000)).toBe(17_000);
    expect(nextWelcomeDeadlineMs(UPDATE_WINDOW_TIMEOUT_MS)).toBeNull();
  });

  it("ignore une attente sans limite (vérification retenue par un test)", () => {
    expect(nextWelcomeDeadlineMs(0, { minMs: 0, checkTimeoutMs: Infinity })).toBe(
      UPDATE_WINDOW_TIMEOUT_MS,
    );
  });
});

describe("launchScreenMode (H4)", () => {
  it("critère 2 : pendant l'accueil, l'écran montre « Nano Buro » et la version", () => {
    expect(launchScreenMode(true, false)).toBe("welcome");
  });

  it("critère 4 : avec une mise à jour, l'écran devient « se met à jour », que l'accueil soit fini ou non", () => {
    expect(launchScreenMode(true, true)).toBe("updating");
    expect(launchScreenMode(false, true)).toBe("updating");
  });

  it("critère 3 : l'accueil terminé sans mise à jour, plus d'écran", () => {
    expect(launchScreenMode(false, false)).toBeNull();
  });
});

describe("decideUpdate après l'accueil (H4)", () => {
  const ready = {
    updateReady: true,
    documentLoaded: true,
    activity: NO_ACTIVITY,
    reloadKeepsDocument: true,
    reloadedThisLaunch: false,
  };

  it("critère 4 : une mise à jour trouvée pendant l'accueil est appliquée (H1)", () => {
    expect(decideUpdate({ ...ready, welcomeOver: false })).toBe("reload");
  });

  it("critère 3 : une mise à jour trouvée après l'accueil attend le lancement suivant, sans fenêtre", () => {
    expect(decideUpdate({ ...ready, welcomeOver: true })).toBe("next-launch");
  });
});
