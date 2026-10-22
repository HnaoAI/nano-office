// Restauration au lancement (T0d) : le dernier document modifié revient depuis sa copie de secours,
// avec le fichier où il était enregistré (PL3). Découpé de useDocumentFile.ts (M1), sans changement.
import { useEffect } from "react";
import type * as Y from "yjs";
import { restoredDocument } from "../core/backup";
import { createNewDocument } from "../core/documentFile";
import type { OpenDocument } from "../core/types";
import type { BackupStore } from "../storage/backupStore";
import type { FileStore } from "../storage/fileStore";
import { recoveredMessage, type FileMessage } from "./fileMessages";

/**
 * Au chargement, affiche le dernier document modifié, restauré depuis sa copie de secours (T0d,
 * critère 4), ou un document neuf s'il n'y en a pas.
 * @param backups copies de secours du navigateur
 * @param store fichiers ; `restore` retrouve le fichier du document restauré (PL3)
 * @param pauseAtStart reçoit le Y.Doc restauré avec son fichier : sa sauvegarde automatique commence en pause
 * @param setDocument affiche le document
 * @param setMessage affiche le message « document récupéré »
 */
export function useLaunchRestore(
  backups: BackupStore,
  store: FileStore,
  pauseAtStart: (ydoc: Y.Doc) => void,
  setDocument: (document: OpenDocument) => void,
  setMessage: (message: FileMessage) => void,
) {
  useEffect(() => {
    let cancelled = false;
    const id = backups.lastModifiedId();
    void (async () => {
      const restored = id ? restoredDocument(id, await backups.read(id)) : null;
      // PL3 : le document reprend le fichier où il était enregistré, sans rien y écrire pour l'instant.
      const file = restored ? await store.restore(restored.id) : null;
      if (cancelled) return;
      if (!restored) {
        setDocument(createNewDocument());
        return;
      }
      // INVARIANT (PL3, critère 4) : le fichier retrouvé n'est réécrit qu'après un enregistrement choisi
      // par l'utilisateur, qui a vu son nom ; jusque-là, la sauvegarde automatique attend.
      if (file) pauseAtStart(restored.ydoc);
      // H2 : la restauration n'est pas un signe de travail commencé ; une nouvelle version peut recharger
      // la page, qui restaure alors le même document, avec le même fichier retrouvé et le même message.
      setDocument(file ? { ...restored, fileName: file.name } : restored);
      setMessage(recoveredMessage(file));
    })();
    return () => {
      cancelled = true;
    };
  }, [backups, store, pauseAtStart, setDocument, setMessage]);
}
