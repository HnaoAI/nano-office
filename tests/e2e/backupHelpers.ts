// Aides des tests Playwright qui passent par la copie de secours (U1b) : attendre la fin de ses écritures.
// Même méthode que `flushBackups` de secours.spec.ts, laissé tel quel (U1b, critère 7).
import type { Page } from "@playwright/test";

const BACKUP_PREFIX = "nano-office-backup:";

/**
 * Attend que les écritures en cours dans les copies de secours soient terminées : une transaction
 * en lecture ouverte après elles ne se termine qu'après elles (ordre des transactions d'IndexedDB).
 */
export async function flushBackups(page: Page) {
  await page.evaluate(async (prefix) => {
    const databases = await indexedDB.databases();
    for (const { name } of databases) {
      if (!name?.startsWith(prefix)) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve) => {
        const transaction = db.transaction("updates", "readonly");
        transaction.objectStore("updates").count();
        transaction.oncomplete = () => resolve();
      });
      db.close();
    }
  }, BACKUP_PREFIX);
}
