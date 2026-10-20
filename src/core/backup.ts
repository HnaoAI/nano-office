// Copie de secours d'un document (T0d), sans accès au navigateur : relecture des mises à jour Yjs
// enregistrées par y-indexeddb, comparaison avec un fichier ouvert, document récupéré ou restauré.
import * as Y from "yjs";
import { contentSnapshot, hasUnsavedChanges } from "./documentFile";
import type { OpenDocument } from "./types";

/**
 * Résultat de la comparaison d'un fichier ouvert avec la copie de secours de son `id` :
 * - `none` : pas de copie de secours ;
 * - `same` : même contenu que le fichier, il s'ouvre sans question (critère 7) ;
 * - `different` : contenu différent, il faut demander à l'utilisateur (critère 8).
 */
export type BackupComparison = "none" | "same" | "different";

/**
 * Relit une copie de secours dans un Y.Doc neuf, jamais relié à l'éditeur ni au fichier ouvert (critère 6).
 * Ne lève jamais d'exception.
 * @param updates mises à jour Yjs dans l'ordre où y-indexeddb les a enregistrées
 * @returns le Y.Doc, ou null s'il n'y a pas de copie (aucune mise à jour, ou aucune donnée) ou si elle est illisible
 */
export function backupFromUpdates(updates: Uint8Array[]): Y.Doc | null {
  const ydoc = new Y.Doc();
  try {
    Y.transact(ydoc, () => updates.forEach((update) => Y.applyUpdate(ydoc, update)));
  } catch {
    return null;
  }
  return ydoc.store.clients.size > 0 ? ydoc : null;
}

/**
 * Compare un fichier ouvert à sa copie de secours, avec la même conversion que `serializeDocument` (T0a).
 * Seul le contenu compte : deux historiques Yjs différents au même contenu sont identiques.
 */
export function compareWithBackup(file: OpenDocument, backup: Y.Doc | null): BackupComparison {
  if (!backup) return "none";
  return contentSnapshot(backup) === contentSnapshot(file.ydoc) ? "same" : "different";
}

/**
 * Document affiché après « Récupérer les modifications non enregistrées » (critère 9) : le contenu de
 * la copie seule, sans fusion avec le fichier. Il garde le nom et l'empreinte du fichier, donc il est
 * non enregistré tant qu'il diffère du fichier.
 * INVARIANT : on remplace le Y.Doc du fichier par celui de la copie ; on n'applique jamais l'un sur l'autre.
 */
export function recoveredDocument(file: OpenDocument, backup: Y.Doc): OpenDocument {
  return { ...file, ydoc: backup };
}

/**
 * Document restauré au chargement de la page (critère 4), non enregistré et sans nom de fichier :
 * `useDocumentFile` lui redonne ensuite le fichier retenu par le navigateur, s'il y en a un (PL3).
 * @returns null si la copie n'existe pas ou ne contient aucun texte (rien à récupérer)
 */
export function restoredDocument(id: string, backup: Y.Doc | null): OpenDocument | null {
  if (!backup) return null;
  const document: OpenDocument = { id, ydoc: backup, fileName: null, savedSnapshot: null };
  return hasUnsavedChanges(document) ? document : null;
}
