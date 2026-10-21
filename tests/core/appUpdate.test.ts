// Tests de la décision « recharger maintenant ou attendre » d'une nouvelle version (src/core/appUpdate.ts),
// ticket H1, critères 5 à 8, et ticket H2 (un document restauré ne reporte plus la mise à jour).
import { describe, expect, it } from "vitest";
import {
  decideUpdate,
  NO_ACTIVITY,
  type LaunchActivity,
  type LaunchState,
} from "../../src/core/appUpdate";

/** Lancement ordinaire : nouvelle version prête, document chargé, rien de commencé. */
function launch(overrides: Partial<LaunchState> = {}): LaunchState {
  return {
    updateReady: true,
    documentLoaded: true,
    activity: NO_ACTIVITY,
    reloadedThisLaunch: false,
    ...overrides,
  };
}

function withActivity(activity: Partial<LaunchActivity>): LaunchState {
  return launch({ activity: { ...NO_ACTIVITY, ...activity } });
}

describe("decideUpdate (H1)", () => {
  it("critère 5 : une nouvelle version prête avant que l'utilisateur ait commencé à travailler est appliquée tout de suite", () => {
    expect(decideUpdate(launch())).toBe("reload");
  });

  it("critère 5 : sans nouvelle version, rien ne se passe", () => {
    expect(decideUpdate(launch({ updateReady: false }))).toBe("wait");
  });

  it("critère 5 : pendant la lecture de la copie de secours, la décision est reportée", () => {
    // On ne sait pas encore si un document va être restauré.
    expect(decideUpdate(launch({ documentLoaded: false }))).toBe("wait");
  });

  it("critère 6 : un caractère tapé ou une mise en forme appliquée reporte la mise à jour au lancement suivant", () => {
    expect(decideUpdate(withActivity({ edited: true }))).toBe("next-launch");
  });

  it("critère 6 : un fichier ouvert ou en cours d'ouverture reporte la mise à jour au lancement suivant", () => {
    expect(decideUpdate(withActivity({ fileAction: true }))).toBe("next-launch");
  });

  it("critère 6 : la question de la copie de secours affichée reporte la mise à jour au lancement suivant", () => {
    expect(decideUpdate(withActivity({ backupQuestion: true }))).toBe("next-launch");
  });

  it("H2, critère 1 : un document restauré depuis la copie de secours, sans rien d'autre, n'empêche pas la mise à jour", () => {
    // Changement autorisé par le product owner (H2) : la restauration n'est plus un signe de travail commencé.
    // Le document restauré est affiché : la copie de secours a été lue, et rien n'a été fait depuis.
    expect(decideUpdate(launch({ documentLoaded: true, activity: NO_ACTIVITY }))).toBe("reload");
  });

  it("H2, critère 2 : les signes de travail commencé sont ceux de H1, sans la restauration", () => {
    expect(Object.keys(NO_ACTIVITY).sort()).toEqual(["backupQuestion", "edited", "fileAction"]);
  });

  it("critère 6 : le travail commencé l'emporte même si la copie de secours est encore en lecture", () => {
    expect(
      decideUpdate(
        launch({ documentLoaded: false, activity: { ...NO_ACTIVITY, fileAction: true } }),
      ),
    ).toBe("next-launch");
  });

  it("critère 7 : jamais plus d'un rechargement par lancement, donc aucune boucle", () => {
    expect(decideUpdate(launch({ reloadedThisLaunch: true }))).toBe("next-launch");
  });

  it("critère 7 : chaque combinaison possible ne recharge que si rien n'est commencé et rien n'a été rechargé", () => {
    const flags = [false, true];
    for (const updateReady of flags)
      for (const documentLoaded of flags)
        for (const reloadedThisLaunch of flags)
          for (const edited of flags)
            for (const fileAction of flags)
              for (const backupQuestion of flags) {
                const activity = { edited, fileAction, backupQuestion };
                const started = Object.values(activity).some(Boolean);
                const decision = decideUpdate({
                  updateReady,
                  documentLoaded,
                  reloadedThisLaunch,
                  activity,
                });
                expect(decision === "reload").toBe(
                  updateReady && documentLoaded && !reloadedThisLaunch && !started,
                );
              }
  });
});
