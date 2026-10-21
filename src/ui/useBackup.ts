// Hook React de la copie de secours du document affiché (T0d) : relie le Y.Doc à y-indexeddb,
// retient le dernier document modifié et déclenche l'alerte du navigateur avant fermeture.
// Indique aussi au pied de page si la copie est à jour (U1a).
import { useEffect, useEffectEvent, useState } from "react";
import type * as Y from "yjs";
import type { BackupStore } from "../storage/backupStore";
import { isReloadingForUpdate } from "./useAppUpdate";

/**
 * Copie de secours du document affiché.
 * INVARIANT : le document passé ici doit pouvoir être relié sans fusion (copie absente, identique ou effacée),
 * c'est `useDocumentFile` qui le vérifie avant de l'afficher (critère 6).
 * @param document document affiché, ou null pendant le chargement
 * @param unsaved vrai s'il a des modifications non enregistrées dans le fichier
 * @returns vrai quand la copie de secours du document affiché est reliée et à jour (U1a, critère 5)
 */
export function useBackup(
  backups: BackupStore,
  document: { id: string; ydoc: Y.Doc } | null,
  unsaved: boolean,
) {
  const id = document?.id;
  const ydoc = document?.ydoc;
  const [linked, setLinked] = useState<Y.Doc | null>(null);

  // Chaque modification est copiée dans IndexedDB (critère 1), sous l'id du document (critère 2).
  useEffect(() => {
    if (!id || !ydoc) return;
    let current = true;
    void backups.attach(id, ydoc).then((ok) => {
      if (current && ok) setLinked(ydoc);
    });
    return () => {
      current = false;
      backups.detach();
    };
  }, [backups, id, ydoc]);

  // Le dernier document non enregistré est restauré au chargement (critère 4) ; un document
  // enregistré ne l'est pas, puisque le fichier est à jour. `ydoc` est suivi aussi : « Récupérer »
  // remplace le Y.Doc d'un document au même id, après que `useDocumentFile` a oublié l'ancien.
  useEffect(() => {
    if (!id) return;
    if (unsaved) backups.setLastModifiedId(id);
    else if (backups.lastModifiedId() === id) backups.setLastModifiedId(null);
  }, [backups, id, ydoc, unsaved]);

  // Alerte du navigateur à la fermeture de l'onglet (critère 5). Le texte est imposé par le navigateur.
  // Pas d'alerte pour le rechargement d'une mise à jour sans travail commencé (H2) : le document
  // restauré est dans sa copie de secours et revient à l'identique, s'il est encore le dernier modifié.
  const onBeforeUnload = useEffectEvent((event: BeforeUnloadEvent) => {
    if (!unsaved) return;
    if (isReloadingForUpdate() && id !== undefined && backups.lastModifiedId() === id) return;
    event.preventDefault();
    // Safari n'affiche l'alerte que si `returnValue` est rempli.
    event.returnValue = "";
  });
  useEffect(() => {
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return ydoc !== undefined && linked === ydoc;
}
