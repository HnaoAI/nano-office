// Accès aux fichiers par l'API File System Access (Chrome, Edge), pour T0c.
// Les sélecteurs sont fournis par l'appelant, ce qui permet de les remplacer dans les tests.
import { DEFAULT_FILE_NAME } from "../core/types";
import type { FileHandleMemory } from "./fileHandleMemory";
import type { FileStore, OpenedFile, RestoredFile, SaveOptions, SaveResult } from "./fileStore";

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
  /**
   * Date de modification du fichier courant, lue à l'ouverture et après chaque écriture de Nano Buro
   * (T1.6, décision du PO à la relecture). null : inconnue, la sauvegarde automatique n'écrit pas.
   */
  private knownLastModified: number | null = null;
  /** Document dont le fichier courant est retenu (PL3) : sa date y est mise à jour après chaque écriture. */
  private documentId: string | null = null;
  /**
   * Date retenue au dernier lancement pour le fichier retrouvé (PL3, relecture), à comparer au premier
   * enregistrement, après l'autorisation d'écrire. `undefined` : rien à comparer.
   */
  private rememberedLastModified: number | null | undefined = undefined;

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
    this.setCurrent(null, null);
  }

  async remember(documentId: string): Promise<void> {
    if (!this.current) return;
    this.documentId = documentId;
    await this.rememberCurrent();
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
      // Au lancement, la sauvegarde automatique attend un premier « Enregistrer » choisi par
      // l'utilisateur (PL3, critère 4) ; c'est lui qui donnera la date du fichier.
      this.setCurrent(handle, null);
      this.documentId = documentId;
      // Ce premier « Enregistrer » ne doit pas écraser sans prévenir une version venue de l'autre
      // ordinateur pendant la fermeture (relecture de PL3, scénario lundi, mardi, mercredi).
      this.rememberedLastModified = remembered.lastModified;
      const needsPermission = permission !== "granted";
      if (needsPermission) return { name: handle.name, needsPermission, changedElsewhere: false };
      // La date se lit tout de suite : l'alerte du lancement prévient, et un « Enregistrer » choisi
      // ensuite est explicite, il n'est donc plus vérifié.
      const changedElsewhere = !(await this.unchangedSinceLastLaunch(handle));
      this.rememberedLastModified = undefined;
      return { name: handle.name, needsPermission, changedElsewhere };
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
    const blob = await handle.getFile();
    const file = { name: handle.name, text: await blob.text() };
    if (!accept || accept(file)) this.setCurrent(handle, blob.lastModified);
    return file;
  }

  async save(text: string, options: SaveOptions = {}): Promise<SaveResult> {
    if (!this.current) {
      // La sauvegarde automatique n'ouvre jamais de sélecteur (T1.6).
      return options.onlyIfUnchanged ? { status: "failed" } : this.saveAs(text, DEFAULT_FILE_NAME);
    }
    if (options.onlyIfUnchanged && !(await this.unchangedOnDisk(this.current))) {
      return { status: "conflict", name: this.current.name };
    }
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
    if (result.status === "saved") this.setCurrent(handle, await lastModifiedOf(handle));
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
      if (handle === this.current && this.rememberedLastModified !== undefined) {
        // Une seule fois : après l'alerte, un nouvel « Enregistrer » est un choix explicite.
        const unchanged = await this.unchangedSinceLastLaunch(handle);
        this.rememberedLastModified = undefined;
        if (!unchanged) return { status: "conflict", name: handle.name };
      }
      const writable = await handle.createWritable();
      try {
        await writable.write(text);
      } catch (error) {
        await writable.abort().catch(() => undefined);
        throw error;
      }
      await writable.close();
      // Date de notre propre écriture : elle ne sera pas prise pour une modification faite ailleurs.
      if (handle === this.current) {
        this.knownLastModified = await lastModifiedOf(handle);
        await this.rememberCurrent();
      }
      return { status: "saved", name: handle.name };
    } catch {
      return { status: "failed" };
    }
  }

  /**
   * Vrai si le fichier n'a pas été modifié en dehors de Nano Buro depuis son ouverture ou le dernier
   * enregistrement (T1.6, décision du PO à la relecture). Les fichiers de la famille sont sur un dossier
   * synchronisé : la sauvegarde automatique ne doit pas écraser sans prévenir une version venue de
   * l'autre ordinateur. Ce n'est pas une fusion des deux versions, seulement « ne pas écraser ».
   */
  /** Change de fichier courant, avec sa date connue ; l'ancien document ne le concerne plus. */
  private setCurrent(handle: NanoFileHandle | null, lastModified: number | null) {
    this.current = handle;
    this.knownLastModified = lastModified;
    this.documentId = null;
    this.rememberedLastModified = undefined;
  }

  /** Vrai si la date du fichier est celle retenue au dernier lancement (PL3, relecture). */
  private async unchangedSinceLastLaunch(handle: NanoFileHandle): Promise<boolean> {
    if (this.rememberedLastModified === undefined) return true;
    const lastModified = await lastModifiedOf(handle);
    return lastModified !== null && lastModified === this.rememberedLastModified;
  }

  /** Retient le fichier courant et sa date pour le prochain lancement (PL3). Ne lève jamais d'exception. */
  private async rememberCurrent() {
    if (!this.memory || !this.current || this.documentId === null) return;
    const file = { handle: this.current, lastModified: this.knownLastModified };
    await this.memory.remember(this.documentId, file).catch(() => undefined);
  }

  private async unchangedOnDisk(handle: NanoFileHandle): Promise<boolean> {
    if (this.knownLastModified === null) return false;
    return (await lastModifiedOf(handle)) === this.knownLastModified;
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
