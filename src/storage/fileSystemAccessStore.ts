// Accès aux fichiers par l'API File System Access (Chrome, Edge), pour T0c.
// Les sélecteurs sont fournis par l'appelant, ce qui permet de les remplacer dans les tests.
import { DEFAULT_FILE_NAME } from "../core/types";
import type { FileHandleMemory } from "./fileHandleMemory";
import type { FileStore, OpenedFile, RestoredFile, SaveResult } from "./fileStore";

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

/** Date de modification d'un fichier, ou null si elle ne peut pas être lue. */
async function lastModifiedOf(handle: NanoFileHandle): Promise<number | null> {
  try {
    return (await handle.getFile()).lastModified;
  } catch {
    return null;
  }
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
  /** Document dont le fichier courant est retenu (PL3) : sa date est mise à jour après chaque écriture. */
  private documentId: string | null = null;
  /**
   * PL3, critère 4 : date attendue du fichier retrouvé au lancement, vérifiée avant sa première écriture
   * (null : inconnue, le fichier n'est pas réécrit). `undefined` : pas de vérification à faire.
   */
  private expectedLastModified: number | null | undefined = undefined;

  /**
   * @param pickers sélecteurs du navigateur, ou de faux sélecteurs dans les tests
   * @param memory poignées retenues entre deux lancements (PL3) ; sans elle, rien n'est retenu
   */
  constructor(
    private readonly pickers: FilePickers,
    private readonly memory?: FileHandleMemory,
  ) {}

  canSaveInPlace(): boolean {
    return true;
  }

  forget(): void {
    this.setCurrent(null);
  }

  async remember(documentId: string): Promise<void> {
    if (!this.current) return;
    this.documentId = documentId;
    await this.saveLastModified(this.current);
  }

  /**
   * Le fichier retenu redevient le fichier courant. On ne fait que demander l'état de l'autorisation,
   * sans la redemander : le navigateur exige pour cela un geste de l'utilisateur (PL3, critère 2).
   */
  async restore(documentId: string): Promise<RestoredFile | null> {
    try {
      const remembered = await this.memory?.recall(documentId);
      if (!remembered) return null;
      const { handle } = remembered;
      const permission = handle.queryPermission
        ? await handle.queryPermission({ mode: "readwrite" })
        : "granted";
      this.setCurrent(handle);
      this.documentId = documentId;
      this.expectedLastModified = remembered.lastModified;
      return { name: handle.name, needsPermission: permission !== "granted" };
    } catch {
      return null;
    }
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
    if (!accept || accept(file)) this.setCurrent(handle);
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
    if (result.status === "saved") this.setCurrent(handle);
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
      if (handle === this.current && !(await this.unchangedSinceLaunch(handle))) {
        return { status: "conflict", name: handle.name };
      }
      const writable = await handle.createWritable();
      try {
        await writable.write(text);
      } catch (error) {
        await writable.abort().catch(() => undefined);
        throw error;
      }
      await writable.close();
      if (handle === this.current) {
        this.expectedLastModified = undefined;
        await this.saveLastModified(handle);
      }
      return { status: "saved", name: handle.name };
    } catch {
      return { status: "failed" };
    }
  }

  /** Change de fichier courant : l'ancien document et sa vérification ne le concernent plus. */
  private setCurrent(handle: NanoFileHandle | null) {
    this.current = handle;
    this.documentId = null;
    this.expectedLastModified = undefined;
  }

  /**
   * Vrai si le fichier retrouvé au lancement n'a pas été modifié en dehors de Nano Buro depuis son
   * dernier enregistrement (PL3, critère 4), ou s'il n'y a rien à vérifier. Les fichiers de la famille
   * sont sur un dossier synchronisé : une version plus récente, venue d'un autre ordinateur, ne doit
   * pas être écrasée par la copie de secours de celui-ci.
   */
  private async unchangedSinceLaunch(handle: NanoFileHandle): Promise<boolean> {
    if (this.expectedLastModified === undefined) return true;
    const lastModified = await lastModifiedOf(handle);
    return lastModified !== null && lastModified === this.expectedLastModified;
  }

  /** Retient le fichier courant et sa date pour le prochain lancement (PL3). Ne lève jamais d'exception. */
  private async saveLastModified(handle: NanoFileHandle) {
    if (!this.memory || this.documentId === null) return;
    const lastModified = await lastModifiedOf(handle);
    await this.memory.remember(this.documentId, { handle, lastModified }).catch(() => undefined);
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
