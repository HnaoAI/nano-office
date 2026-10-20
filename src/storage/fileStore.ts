// Interface d'accès aux fichiers `.nano` (T0c) et choix de l'implémentation selon le navigateur.
// L'interface ne passe que du texte : la lecture du format est faite par src/core/.
import { DownloadStore } from "./downloadStore";
import { createFileHandleMemory } from "./fileHandleMemory";
import { type FilePickers, FileSystemAccessStore } from "./fileSystemAccessStore";

/**
 * Résultat d'un enregistrement. Ne lève jamais d'exception :
 * - `saved` : le fichier a été écrit sur le disque (API File System Access) ;
 * - `downloaded` : repli de Safari et Firefox, le fichier a été téléchargé ;
 * - `cancelled` : l'utilisateur a fermé le sélecteur sans choisir ;
 * - `failed` : écriture impossible (autorisation refusée, disque plein…). Le fichier d'origine est intact.
 */
export type SaveResult =
  | { status: "saved"; name: string }
  | { status: "downloaded"; name: string }
  | { status: "cancelled" }
  | { status: "failed" };

/**
 * Fichier retrouvé au lancement pour un document (PL3) : son nom, et s'il faut redemander au
 * navigateur l'autorisation d'y écrire (critère 2).
 */
export interface RestoredFile {
  name: string;
  needsPermission: boolean;
}

/** Fichier lu par « Ouvrir » : son nom et son texte (UTF-8). */
export interface OpenedFile {
  name: string;
  text: string;
}

/**
 * Accès aux fichiers de l'utilisateur. Garde en mémoire le « fichier courant », celui que
 * « Enregistrer » réécrit. Les tests d'interface la remplacent par une fausse implémentation.
 */
export interface FileStore {
  /**
   * Demande un fichier à l'utilisateur et le lit.
   * @param accept appelée avec le fichier lu ; si elle renvoie false, le fichier ne devient pas le
   *   fichier courant. INVARIANT : un fichier refusé (abîmé, invalide) ne doit jamais pouvoir être
   *   réécrit par « Enregistrer » (T0c, critère 15). Sans `accept`, le fichier est toujours retenu.
   * @returns le fichier lu, ou null si l'utilisateur annule
   * @throws si le fichier choisi ne peut pas être lu
   */
  open(accept?: (file: OpenedFile) => boolean): Promise<OpenedFile | null>;
  /** Réécrit le fichier courant, ou se comporte comme `saveAs(text, DEFAULT_FILE_NAME)` s'il n'y en a pas. */
  save(text: string): Promise<SaveResult>;
  /** Demande un emplacement en proposant `suggestedName`, écrit le fichier et en fait le fichier courant. */
  saveAs(text: string, suggestedName: string): Promise<SaveResult>;
  /** Vrai si le fichier peut être réécrit sur place (API File System Access disponible). */
  canSaveInPlace(): boolean;
  /** Oublie le fichier courant (« Nouveau ») : le prochain « Enregistrer » demandera un emplacement. */
  forget(): void;
  /**
   * Retient le fichier courant comme fichier du document `documentId`, pour le prochain lancement (PL3).
   * Sans effet s'il n'y a pas de fichier courant ou pas de mémoire (Safari, Firefox). Ne lève jamais d'exception.
   */
  remember(documentId: string): Promise<void>;
  /**
   * Reprend le fichier retenu pour `documentId` comme fichier courant, sans rien écrire ni rien demander (PL3).
   * Ne lève jamais d'exception.
   * @returns le fichier retrouvé, ou null s'il n'y en a pas
   */
  restore(documentId: string): Promise<RestoredFile | null>;
}

/** Ce que `selectFileStore` regarde dans l'environnement du navigateur (en pratique `window`). */
export interface FileStoreEnvironment {
  showOpenFilePicker?: unknown;
  showSaveFilePicker?: unknown;
}

/**
 * Choisit l'implémentation : l'API File System Access si les deux sélecteurs existent (Chrome, Edge),
 * sinon le repli par téléchargement (Safari, Firefox).
 */
export function selectFileStore(environment: FileStoreEnvironment): FileStore {
  const { showOpenFilePicker, showSaveFilePicker } = environment;
  if (typeof showOpenFilePicker === "function" && typeof showSaveFilePicker === "function") {
    const pickers = {
      showOpenFilePicker: showOpenFilePicker.bind(environment),
      showSaveFilePicker: showSaveFilePicker.bind(environment),
    } as FilePickers;
    return new FileSystemAccessStore(pickers, createFileHandleMemory());
  }
  return new DownloadStore();
}

declare global {
  interface Window {
    /** Fausse implémentation installée par les tests Playwright (tests/e2e/fakeFileStore.ts). */
    __nanoTestFileStore?: FileStore;
  }
}

/**
 * Crée l'accès aux fichiers de ce navigateur. En développement, une fausse implémentation
 * installée par les tests d'interface est utilisée à la place (jamais dans la version publiée).
 */
export function createFileStore(): FileStore {
  if (import.meta.env.DEV && window.__nanoTestFileStore) {
    return window.__nanoTestFileStore;
  }
  return selectFileStore(window as FileStoreEnvironment);
}
