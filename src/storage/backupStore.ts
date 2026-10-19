// Copie de secours des documents dans le navigateur (T0d) : une base IndexedDB par `id` de document,
// tenue à jour par y-indexeddb, et le nom du dernier document modifié dans localStorage.
import { IndexeddbPersistence } from "y-indexeddb";
import type * as Y from "yjs";
import { backupFromUpdates } from "../core/backup";

/**
 * Préfixe des bases IndexedDB de copie de secours, suivi de l'`id` du document.
 * INVARIANT : ce préfixe et `LAST_MODIFIED_KEY` gardent « nano-office » malgré le renommage en
 * Nano Buro (R1), pour que les copies déjà présentes dans le navigateur restent récupérables.
 */
export const BACKUP_DB_PREFIX = "nano-office-backup:";
/** Clé localStorage du dernier document modifié, restauré au chargement de la page (critère 4). */
const LAST_MODIFIED_KEY = "nano-office:last-modified-document";
/** Magasin d'objets où y-indexeddb range les mises à jour Yjs. */
const UPDATES_STORE = "updates";

/**
 * Copie de secours des documents. Une seule copie est reliée à la fois : celle du document affiché.
 * INVARIANT : la copie est rangée sous l'`id` du document (critère 2) ; deux documents ne partagent jamais une base.
 */
export interface BackupStore {
  /**
   * Lit la copie de secours de `id` dans un Y.Doc neuf, sans rien écrire et sans la relier (critères 6 et 11).
   * @returns null s'il n'y a pas de copie, ou si elle est illisible
   */
  read(id: string): Promise<Y.Doc | null>;
  /**
   * Relie `ydoc` à la copie de `id` : chaque modification y est copiée (critère 1). Détache la copie précédente.
   * INVARIANT : y-indexeddb applique d'abord la copie existante sur `ydoc`. Ne relier que si la copie est
   * absente, identique à `ydoc` (même historique) ou effacée, sinon Yjs additionnerait les deux contenus.
   * @returns vrai une fois la copie à jour (affiché dans le pied de page, U1a) ; faux s'il n'y a pas de copie
   */
  attach(id: string, ydoc: Y.Doc): Promise<boolean>;
  /** Arrête de copier le document relié. La copie reste dans le navigateur. */
  detach(): void;
  /** Efface la copie de `id` (critère 10), après l'avoir détachée si c'est celle du document affiché. */
  remove(id: string): Promise<void>;
  /** Identifiant du dernier document modifié et non enregistré, ou null. */
  lastModifiedId(): string | null;
  /** Retient (ou oublie, avec null) le dernier document modifié et non enregistré. */
  setLastModifiedId(id: string | null): void;
}

/** Copie de secours dans IndexedDB, via y-indexeddb. */
class IndexedDbBackupStore implements BackupStore {
  private attached: { id: string; persistence: IndexeddbPersistence } | null = null;

  read(id: string): Promise<Y.Doc | null> {
    return new Promise((resolve) => {
      const request = indexedDB.open(BACKUP_DB_PREFIX + id);
      // La base n'existe pas : on annule sa création, pour ne rien écrire.
      request.onupgradeneeded = () => request.transaction?.abort();
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result;
        try {
          const all = db.transaction(UPDATES_STORE, "readonly").objectStore(UPDATES_STORE).getAll();
          all.onsuccess = () => {
            db.close();
            resolve(backupFromUpdates(all.result as Uint8Array[]));
          };
          all.onerror = () => {
            db.close();
            resolve(null);
          };
        } catch {
          db.close();
          resolve(null);
        }
      };
    });
  }

  async attach(id: string, ydoc: Y.Doc): Promise<boolean> {
    this.detach();
    const persistence = new IndexeddbPersistence(BACKUP_DB_PREFIX + id, ydoc);
    this.attached = { id, persistence };
    await persistence.whenSynced;
    return true;
  }

  detach(): void {
    void this.attached?.persistence.destroy();
    this.attached = null;
  }

  async remove(id: string): Promise<void> {
    if (this.attached?.id === id) {
      await this.attached.persistence.destroy();
      this.attached = null;
    }
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(BACKUP_DB_PREFIX + id);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  }

  lastModifiedId(): string | null {
    try {
      return localStorage.getItem(LAST_MODIFIED_KEY);
    } catch {
      return null;
    }
  }

  setLastModifiedId(id: string | null): void {
    try {
      if (id === null) localStorage.removeItem(LAST_MODIFIED_KEY);
      else localStorage.setItem(LAST_MODIFIED_KEY, id);
    } catch {
      // Stockage indisponible (navigation privée de certains navigateurs) : pas de restauration au chargement.
    }
  }
}

/** Remplaçant quand IndexedDB n'existe pas : aucune copie de secours, l'application reste utilisable. */
const NO_BACKUP: BackupStore = {
  read: () => Promise.resolve(null),
  attach: () => Promise.resolve(false),
  detach: () => undefined,
  remove: () => Promise.resolve(),
  lastModifiedId: () => null,
  setLastModifiedId: () => undefined,
};

/** Crée la copie de secours de ce navigateur. */
export function createBackupStore(): BackupStore {
  return typeof indexedDB === "undefined" ? NO_BACKUP : new IndexedDbBackupStore();
}
