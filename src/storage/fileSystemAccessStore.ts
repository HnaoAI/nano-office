// Accès aux fichiers par l'API File System Access (Chrome, Edge), pour T0c.
// Les sélecteurs sont fournis par l'appelant, ce qui permet de les remplacer dans les tests.
import { DEFAULT_FILE_NAME } from "../core/types";
import type { FileStore, OpenedFile, SaveResult } from "./fileStore";

/** Types de fichiers proposés par les sélecteurs. */
const NANO_FILE_TYPES = [
  { description: "Document Nano Buro", accept: { "application/json": [".nano"] } },
];

/**
 * Partie de `FileSystemFileHandle` utilisée ici. `queryPermission` et `requestPermission`
 * existent dans Chrome et Edge mais pas encore dans les types de TypeScript.
 */
export interface NanoFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
  queryPermission?(descriptor: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: "readwrite" }): Promise<PermissionState>;
}

/** Sélecteurs de l'API File System Access (`window.showOpenFilePicker`, `window.showSaveFilePicker`). */
export interface FilePickers {
  showOpenFilePicker(options: {
    types: typeof NANO_FILE_TYPES;
    multiple: false;
  }): Promise<NanoFileHandle[]>;
  showSaveFilePicker(options: {
    suggestedName: string;
    types: typeof NANO_FILE_TYPES;
  }): Promise<NanoFileHandle>;
}

/** Vrai si l'erreur vient d'un sélecteur fermé sans choix. */
function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Enregistrement sur place avec l'API File System Access : « Enregistrer sous » demande
 * l'emplacement une fois, puis « Enregistrer » réécrit le même fichier (T0c, critères 4 et 5).
 */
export class FileSystemAccessStore implements FileStore {
  private current: NanoFileHandle | null = null;

  /** @param pickers sélecteurs du navigateur, ou de faux sélecteurs dans les tests */
  constructor(private readonly pickers: FilePickers) {}

  canSaveInPlace(): boolean {
    return true;
  }

  forget(): void {
    this.current = null;
  }

  async open(accept?: (file: OpenedFile) => boolean): Promise<OpenedFile | null> {
    let handle: NanoFileHandle | undefined;
    try {
      [handle] = await this.pickers.showOpenFilePicker({ types: NANO_FILE_TYPES, multiple: false });
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
    if (!handle) return null;
    const file = { name: handle.name, text: await (await handle.getFile()).text() };
    if (!accept || accept(file)) this.current = handle;
    return file;
  }

  async save(text: string): Promise<SaveResult> {
    if (!this.current) return this.saveAs(text, DEFAULT_FILE_NAME);
    return this.write(this.current, text);
  }

  async saveAs(text: string, suggestedName: string): Promise<SaveResult> {
    let handle: NanoFileHandle;
    try {
      handle = await this.pickers.showSaveFilePicker({ suggestedName, types: NANO_FILE_TYPES });
    } catch (error) {
      return isAbort(error) ? { status: "cancelled" } : { status: "failed" };
    }
    const result = await this.write(handle, text);
    if (result.status === "saved") this.current = handle;
    return result;
  }

  /**
   * Écrit le texte dans le fichier.
   * INVARIANT : toujours `createWritable()` puis `close()` (critère 7). Le navigateur écrit dans un
   * fichier temporaire et ne remplace l'original qu'à `close()` : en cas d'erreur, `abort()` le laisse intact.
   */
  private async write(handle: NanoFileHandle, text: string): Promise<SaveResult> {
    try {
      if (!(await this.hasWritePermission(handle))) return { status: "failed" };
      const writable = await handle.createWritable();
      try {
        await writable.write(text);
      } catch (error) {
        await writable.abort().catch(() => undefined);
        throw error;
      }
      await writable.close();
      return { status: "saved", name: handle.name };
    } catch {
      return { status: "failed" };
    }
  }

  /**
   * Un fichier choisi avec « Ouvrir » n'est d'abord accessible qu'en lecture : le navigateur
   * demande une fois l'autorisation d'écrire (critère 5). Ctrl/Cmd+S ou un clic fournit le geste
   * de l'utilisateur que le navigateur exige pour afficher cette demande.
   */
  private async hasWritePermission(handle: NanoFileHandle): Promise<boolean> {
    if (!handle.queryPermission || !handle.requestPermission) return true;
    const mode = { mode: "readwrite" } as const;
    if ((await handle.queryPermission(mode)) === "granted") return true;
    return (await handle.requestPermission(mode)) === "granted";
  }
}
