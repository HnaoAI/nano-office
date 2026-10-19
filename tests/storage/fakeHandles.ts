// Fausses poignées de fichiers et faux sélecteurs de l'API File System Access, pour les tests Vitest.
import type { FilePickers, NanoFileHandle } from "../../src/storage/fileSystemAccessStore";

/** Journal partagé des appels : sélecteurs ouverts et étapes d'écriture, dans l'ordre. */
export type CallLog = string[];

/** Fausse poignée : garde le contenu du fichier en mémoire et journalise chaque étape d'écriture. */
export class FakeHandle implements NanoFileHandle {
  /** Permission d'écriture renvoyée par `queryPermission`. */
  permission: PermissionState = "granted";

  constructor(
    readonly name: string,
    public content: string,
    private readonly log: CallLog,
  ) {}

  async getFile(): Promise<File> {
    return new File([this.content], this.name);
  }

  async queryPermission(): Promise<PermissionState> {
    return this.permission;
  }

  async requestPermission(): Promise<PermissionState> {
    this.log.push(`requestPermission:${this.name}`);
    this.permission = "granted";
    return this.permission;
  }

  async createWritable() {
    this.log.push(`createWritable:${this.name}`);
    let pending = "";
    return {
      write: async (data: string) => {
        this.log.push(`write:${this.name}`);
        pending += data;
      },
      // Le contenu n'est remplacé qu'à la fermeture, comme le fichier temporaire du navigateur.
      close: async () => {
        this.log.push(`close:${this.name}`);
        this.content = pending;
      },
      abort: async () => {
        this.log.push(`abort:${this.name}`);
      },
    };
  }
}

/** Erreur levée par un sélecteur quand l'utilisateur ferme la fenêtre sans choisir. */
export function abortError(): Error {
  const error = new Error("L'utilisateur a annulé");
  error.name = "AbortError";
  return error;
}

/**
 * Faux sélecteurs. `nextOpen` et `nextSave` donnent la poignée renvoyée au prochain appel,
 * ou `null` pour simuler une annulation.
 */
export function fakePickers(log: CallLog) {
  const state: {
    nextOpen: FakeHandle | null;
    nextSave: FakeHandle | null;
    openOptions: unknown[];
    saveOptions: unknown[];
  } = { nextOpen: null, nextSave: null, openOptions: [], saveOptions: [] };
  const pickers: FilePickers = {
    showOpenFilePicker: async (options) => {
      log.push("showOpenFilePicker");
      state.openOptions.push(options);
      if (!state.nextOpen) throw abortError();
      return [state.nextOpen];
    },
    showSaveFilePicker: async (options) => {
      log.push("showSaveFilePicker");
      state.saveOptions.push(options);
      if (!state.nextSave) throw abortError();
      return state.nextSave;
    },
  };
  return { state, pickers };
}
