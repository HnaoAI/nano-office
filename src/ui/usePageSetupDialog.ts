// Hook React de la boîte « Mise en page » (T2.5) : ouverture, application au Y.Doc affiché, fermeture
// avec retour du focus là où il était (l'éditeur, en général).
import { useCallback, useState } from "react";
import type * as Y from "yjs";
import { readPageSetup, writePageSetup, type PageSetup } from "../core/pageSetup";

/**
 * État de la boîte « Mise en page » du document affiché.
 * @param ydoc document affiché, ou null pendant le chargement
 * @param onEdit appelé quand un changement est appliqué : du travail est commencé (H1)
 * @param onOpen appelé à l'ouverture : une mise à jour ne recharge pas la page pendant la saisie (H1)
 * @returns `current` (mise en page lue à l'ouverture, ou null si la boîte est fermée), `show`, `apply`, `close`
 */
export function usePageSetupDialog(ydoc: Y.Doc | null, onEdit: () => void, onOpen: () => void) {
  const [opened, setOpened] = useState<{
    ydoc: Y.Doc;
    setup: PageSetup;
    focus: Element | null;
  } | null>(null);

  const show = useCallback(() => {
    if (!ydoc) return;
    onOpen();
    setOpened({ ydoc, setup: readPageSetup(ydoc), focus: document.activeElement });
  }, [ydoc, onOpen]);

  const close = useCallback(() => {
    const focus = opened?.focus;
    setOpened(null);
    if (focus instanceof HTMLElement) queueMicrotask(() => focus.focus());
  }, [opened]);

  const apply = useCallback(
    (setup: PageSetup) => {
      // Une seule transaction, annulable avec Ctrl/Cmd+Z (critère 5).
      if (opened) {
        writePageSetup(opened.ydoc, setup);
        onEdit();
      }
      close();
    },
    [opened, onEdit, close],
  );

  // Un autre document ouvert entre-temps : la boîte ne s'applique qu'au document où elle a été ouverte.
  const current = opened && opened.ydoc === ydoc ? opened.setup : null;
  return { current, show, apply, close };
}
