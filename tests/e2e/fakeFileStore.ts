// Fausse implémentation de FileStore pour les tests Playwright (T0c), injectée avant le chargement
// de l'application par `page.addInitScript`. Les fichiers vivent en mémoire, dans `window.__fakeFiles`.
import type { Page } from "@playwright/test";
import type { SaveResult } from "../../src/storage/fileStore";

/** État de la fausse implémentation, lisible et modifiable par les tests. */
export interface FakeFilesState {
  /** Contenu des fichiers, par nom. */
  files: Record<string, string>;
  /** Fichier courant, celui que « Enregistrer » réécrit sans rien demander. */
  current: string | null;
  /** Appels reçus, dans l'ordre : `open`, `save`, `saveAs:<nom proposé>`, `forget`, `picker`. */
  calls: string[];
  /** Fichier renvoyé par le prochain « Ouvrir » (null : l'utilisateur annule). */
  nextOpen: string | null;
  /** Nom choisi dans le prochain sélecteur d'enregistrement (null : l'utilisateur annule). */
  nextSaveName: string | null;
  /** `download` simule Safari et Firefox : chaque enregistrement est un téléchargement. */
  mode: "file-system-access" | "download";
}

declare global {
  interface Window {
    __fakeFiles?: FakeFilesState;
  }
}

/** Installe la fausse implémentation dans la page. Appeler avant `page.goto`. */
export async function installFakeFileStore(
  page: Page,
  mode: FakeFilesState["mode"] = "file-system-access",
) {
  await page.addInitScript((initialMode) => {
    // Ce code s'exécute dans le navigateur : il ne peut rien importer.
    const state: FakeFilesState = {
      files: {},
      current: null,
      calls: [],
      nextOpen: null,
      nextSaveName: "document.nano",
      mode: initialMode,
    };
    window.__fakeFiles = state;

    const write = (name: string, text: string): SaveResult => {
      state.files[name] = text;
      return state.mode === "download" ? { status: "downloaded", name } : { status: "saved", name };
    };
    const saveAs = async (text: string, suggestedName: string): Promise<SaveResult> => {
      state.calls.push(`saveAs:${suggestedName}`);
      if (state.mode === "download") {
        state.current = suggestedName;
        return write(suggestedName, text);
      }
      state.calls.push("picker");
      if (state.nextSaveName === null) return { status: "cancelled" };
      state.current = state.nextSaveName;
      return write(state.nextSaveName, text);
    };

    window.__nanoTestFileStore = {
      canSaveInPlace: () => state.mode === "file-system-access",
      open: async (accept) => {
        state.calls.push("open");
        const name = state.nextOpen;
        if (name === null) return null;
        const text = state.files[name];
        if (text === undefined) throw new Error(`Fichier de test absent : ${name}`);
        if (!accept || accept({ name, text })) state.current = name;
        return { name, text };
      },
      save: async (text) => {
        state.calls.push("save");
        if (state.current === null) return saveAs(text, "document.nano");
        return write(state.current, text);
      },
      saveAs: (text, suggestedName) => saveAs(text, suggestedName),
      forget: () => {
        state.calls.push("forget");
        state.current = null;
      },
    };
  }, mode);
}

/** État courant de la fausse implémentation. */
export async function fakeFiles(page: Page): Promise<FakeFilesState> {
  return page.evaluate(() => {
    if (!window.__fakeFiles) throw new Error("installFakeFileStore n'a pas été appelé");
    return window.__fakeFiles;
  });
}

/** Modifie l'état de la fausse implémentation (fichiers disponibles, choix du prochain sélecteur). */
export async function setFakeFiles(page: Page, changes: Partial<FakeFilesState>) {
  await page.evaluate((values) => {
    if (!window.__fakeFiles) throw new Error("installFakeFileStore n'a pas été appelé");
    Object.assign(window.__fakeFiles, values);
  }, changes);
}

/** Vide le journal des appels. */
export async function clearCalls(page: Page) {
  await page.evaluate(() => {
    if (window.__fakeFiles) window.__fakeFiles.calls = [];
  });
}
