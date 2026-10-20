// Souvenir du fichier de chaque document entre deux lancements (PL3) : la poignée de fichier de l'API
// File System Access, gardée dans IndexedDB sous l'`id` du document. Chrome et Edge seulement.
import type { NanoFileHandle } from "./fileSystemAccessStore";

/**
 * Nom de la base IndexedDB des poignées de fichiers. Préfixe « nano-office » comme les copies de
 * secours (R1) ; à ne pas renommer, sinon les fichiers déjà retenus seraient oubliés.
 */
export const FILE_HANDLES_DB = "nano-office-files";
/** Magasin d'objets des poignées, rangées sous l'`id` du document. */
const HANDLES_STORE = "handles";

/** Fichier retenu pour un document (PL3). */
export interface RememberedFile {
  handle: NanoFileHandle;
  /**
   * Date de modification du fichier après la dernière écriture de Nano Buro, ou null si elle n'a pas pu
   * être lue. Au lancement, une date différente signale un fichier modifié ailleurs (relecture de PL3).
   */
  lastModified: number | null;
}

/**
 * Poignées de fichiers retenues, une par document.
 * INVARIANT : rangées sous l'`id` du document, comme la copie de secours : deux documents ne partagent jamais une entrée.
 */
export interface FileHandleMemory {
  /** Retient `file` comme fichier du document `id`, à la place du précédent. */
  remember(id: string, file: RememberedFile): Promise<void>;
  /** Fichier retenu pour le document `id`, ou null. */
  recall(id: string): Promise<RememberedFile | null>;
}

/** Ouvre la base des poignées, en la créant au premier usage. */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FILE_HANDLES_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(HANDLES_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB indisponible"));
  });
}

/** Exécute une requête sur le magasin des poignées et attend la fin de la transaction. */
async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(HANDLES_STORE, mode);
      const request = action(transaction.objectStore(HANDLES_STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB en échec"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB annulé"));
    });
  } finally {
    db.close();
  }
}

/** Poignées gardées dans IndexedDB, qui sait conserver une poignée de fichier entre deux lancements. */
class IndexedDbFileHandleMemory implements FileHandleMemory {
  async remember(id: string, file: RememberedFile): Promise<void> {
    await withStore("readwrite", (store) => store.put(file, id));
  }

  async recall(id: string): Promise<RememberedFile | null> {
    const file = await withStore<unknown>("readonly", (store) => store.get(id));
    return (file as RememberedFile | undefined) ?? null;
  }
}

/** Mémoire des fichiers de ce navigateur, ou undefined sans IndexedDB. */
export function createFileHandleMemory(): FileHandleMemory | undefined {
  return typeof indexedDB === "undefined" ? undefined : new IndexedDbFileHandleMemory();
}
