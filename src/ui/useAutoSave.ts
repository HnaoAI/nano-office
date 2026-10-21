// Hook React de la sauvegarde automatique du document affiché (T1.6) : un AutoSaver par Y.Doc,
// prévenu de chaque modification. La logique des délais est dans src/core/autoSave.ts.
import { useEffect, useEffectEvent, useRef } from "react";
import type * as Y from "yjs";
import { AutoSaver, type AutoSaveRun } from "../core/autoSave";

/**
 * Relie la sauvegarde automatique au Y.Doc affiché.
 * Chaque modification du Y.Doc prévoit un enregistrement (critères 1 et 2). Les écritures de l'éditeur
 * à l'ouverture en font partie : `run` ne doit rien écrire si le contenu n'a pas changé.
 * @param ydoc Y.Doc affiché, ou undefined pendant le chargement
 * @param run enregistrement automatique, appelé avec les valeurs du dernier rendu
 * @param startsPaused vrai si la sauvegarde de ce Y.Doc doit attendre un premier enregistrement réussi (PL3)
 * @param savedBytes taille du dernier fichier écrit ou ouvert : au-delà de 2 Mo, la sauvegarde s'espace (T1.9)
 * @returns l'AutoSaver du document affiché, à prévenir du résultat de chaque enregistrement
 */
export function useAutoSave(
  ydoc: Y.Doc | undefined,
  run: AutoSaveRun,
  startsPaused: (ydoc: Y.Doc) => boolean,
  savedBytes: () => number,
) {
  const saverRef = useRef<AutoSaver | null>(null);
  const onRun = useEffectEvent(run);
  const isPausedAtStart = useEffectEvent(startsPaused);
  const sizeOf = useEffectEvent(savedBytes);

  useEffect(() => {
    if (!ydoc) return;
    const saver = new AutoSaver(
      () => onRun(),
      () => sizeOf(),
    );
    if (isPausedAtStart(ydoc)) saver.pause();
    saverRef.current = saver;
    const onUpdate = () => saver.change();
    ydoc.on("update", onUpdate);
    return () => {
      ydoc.off("update", onUpdate);
      saver.dispose();
      if (saverRef.current === saver) saverRef.current = null;
    };
  }, [ydoc]);

  return saverRef;
}
