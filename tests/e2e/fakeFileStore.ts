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
  /**
   * Appels reçus, dans l'ordre : `open`, `save`, `saveAs:<nom proposé>`, `forget`, `picker`,
   * `requestPermission:<nom>` (PL3). `remember` et `restore` n'y figurent pas : voir `remembered`.
   */
  calls: string[];
  /** Fichier renvoyé par le prochain « Ouvrir » (null : l'utilisateur annule). */
  nextOpen: string | null;
  /** Nom choisi dans le prochain sélecteur d'enregistrement (null : l'utilisateur annule). */
  nextSaveName: string | null;
  /** `download` simule Safari et Firefox : chaque enregistrement est un téléchargement. */
  mode: "file-system-access" | "download";
  /** Vrai : le prochain enregistrement échoue (`failed`), sans rien écrire (U1b). */
  nextSaveFails: boolean;
  /** Vrai : chaque écriture attend `releaseWrites(page)`, pour observer « Enregistrement… » (U1b). */
  holdWrites: boolean;
  /** Fichier retenu pour chaque document, par `id` (PL3). */
  remembered: Record<string, string>;
  /** Autorisation d'écrire d'un fichier retrouvé au lancement ; `prompt` : à redemander (PL3, critère 2). */
  restorePermission: "granted" | "prompt";
  /** Vrai tant que l'autorisation du fichier courant doit être redemandée avant d'écrire. */
  needsPermission: boolean;
}

/** Clé de sessionStorage où `keepAcrossReloads` garde les fichiers et les fichiers retenus (PL3). */
const KEPT_STATE_KEY = "__fakeFilesKept";

declare global {
  interface Window {
    __fakeFiles?: FakeFilesState;
    /** Termine les écritures retenues par `holdWrites`. Hors de l'état, qui doit rester sérialisable. */
    __fakeFilesRelease?: () => void;
  }
}

/** Installe la fausse implémentation dans la page. Appeler avant `page.goto`. */
export async function installFakeFileStore(
  page: Page,
  mode: FakeFilesState["mode"] = "file-system-access",
  { keepAcrossReloads = false }: { keepAcrossReloads?: boolean } = {},
) {
  await page.addInitScript(
    ([initialMode, keep, keptKey]) => {
      // Ce code s'exécute dans le navigateur : il ne peut rien importer.
      const state: FakeFilesState = {
        files: {},
        current: null,
        calls: [],
        nextOpen: null,
        nextSaveName: "document.nano",
        mode: initialMode,
        nextSaveFails: false,
        holdWrites: false,
        remembered: {},
        restorePermission: "granted",
        needsPermission: false,
      };
      // PL3 : fichiers sur le « disque » et fichiers retenus survivent au rechargement de la page,
      // comme le disque et IndexedDB du vrai navigateur.
      if (keep) {
        const kept = sessionStorage.getItem(keptKey);
        if (kept) Object.assign(state, JSON.parse(kept));
        window.addEventListener("pagehide", () => {
          const { files, remembered, restorePermission } = state;
          sessionStorage.setItem(keptKey, JSON.stringify({ files, remembered, restorePermission }));
        });
      }
      window.__fakeFiles = state;

      let held: (() => void)[] = [];
      window.__fakeFilesRelease = () => {
        const waiting = held;
        held = [];
        waiting.forEach((resolve) => resolve());
      };

      const write = async (name: string, text: string): Promise<SaveResult> => {
        if (state.needsPermission) {
          // Le vrai navigateur affiche ici sa demande, avec le nom du fichier ; on suppose que l'utilisateur accepte.
          state.calls.push(`requestPermission:${name}`);
          state.needsPermission = false;
        }
        if (state.holdWrites) await new Promise<void>((resolve) => held.push(resolve));
        if (state.nextSaveFails) {
          state.nextSaveFails = false;
          return { status: "failed" };
        }
        state.files[name] = text;
        return state.mode === "download"
          ? { status: "downloaded", name }
          : { status: "saved", name };
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
        state.needsPermission = false;
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
          if (!accept || accept({ name, text })) {
            state.current = name;
            state.needsPermission = false;
          }
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
        remember: async (documentId) => {
          if (state.mode === "download" || state.current === null) return;
          state.remembered[documentId] = state.current;
        },
        restore: async (documentId) => {
          const name = state.remembered[documentId];
          if (state.mode === "download" || name === undefined) return null;
          state.current = name;
          state.needsPermission = state.restorePermission === "prompt";
          return { name, needsPermission: state.needsPermission };
        },
      };
    },
    [mode, keepAcrossReloads, KEPT_STATE_KEY] as const,
  );
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

/** Termine les écritures retenues par `holdWrites` (U1b). */
export async function releaseWrites(page: Page) {
  await page.evaluate(() => window.__fakeFilesRelease?.());
}

/** Vide le journal des appels. */
export async function clearCalls(page: Page) {
  await page.evaluate(() => {
    if (window.__fakeFiles) window.__fakeFiles.calls = [];
  });
}
