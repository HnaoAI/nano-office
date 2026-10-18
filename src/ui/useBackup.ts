// Hook React de la copie de secours du document affiché (T0d) : relie le Y.Doc à y-indexeddb,
// retient le dernier document modifié et déclenche l'alerte du navigateur avant fermeture.
import { useEffect, useEffectEvent } from "react";
import type * as Y from "yjs";
import type { BackupStore } from "../storage/backupStore";

/**
 * Copie de secours du document affiché.
 * INVARIANT : le document passé ici doit pouvoir être relié sans fusion (copie absente, identique ou effacée),
 * c'est `useDocumentFile` qui le vérifie avant de l'afficher (critère 6).
 * @param document document affiché, ou null pendant le chargement
 * @param unsaved vrai s'il a des modifications non enregistrées dans le fichier
 */
export function useBackup(
  backups: BackupStore,
  document: { id: string; ydoc: Y.Doc } | null,
  unsaved: boolean,
) {
  const id = document?.id;
  const ydoc = document?.ydoc;

  // Chaque modification est copiée dans IndexedDB (critère 1), sous l'id du document (critère 2).
  useEffect(() => {
    if (!id || !ydoc) return;
    backups.attach(id, ydoc);
    return () => backups.detach();
  }, [backups, id, ydoc]);

  // Le dernier document non enregistré est restauré au chargement (critère 4) ; un document
  // enregistré ne l'est pas, puisque le fichier est à jour.
  useEffect(() => {
    if (!id) return;
    if (unsaved) backups.setLastModifiedId(id);
    else if (backups.lastModifiedId() === id) backups.setLastModifiedId(null);
  }, [backups, id, unsaved]);

  // Alerte du navigateur à la fermeture de l'onglet (critère 5). Le texte est imposé par le navigateur.
  const onBeforeUnload = useEffectEvent((event: BeforeUnloadEvent) => {
    if (!unsaved) return;
    event.preventDefault();
    // Safari n'affiche l'alerte que si `returnValue` est rempli.
    event.returnValue = "";
  });
  useEffect(() => {
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
}
