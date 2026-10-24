// Hook React de la boîte « Mise en page » (T2.5) : ouverture, application au Y.Doc affiché, fermeture
// avec retour du focus là où il était (l'éditeur, en général). Les numéros de page (T2.15), l'en-tête et
// le pied de page (T2.16) s'appliquent avec la mise en page, dans la même étape d'annulation.
import { useCallback, useState } from "react";
import type * as Y from "yjs";
import { readHeaderFooter, writeHeaderFooter, type HeaderFooter } from "../core/headerFooter";
import {
  PAGE_SETUP_ORIGIN,
  readPageSetup,
  writePageSetup,
  type PageSetup,
} from "../core/pageSetup";
import type { HeaderFooterField } from "./HeaderFooterFields";

/** Réglages lus à l'ouverture de la boîte. */
export interface OpenedPageSetup {
  setup: PageSetup;
  headerFooter: HeaderFooter;
  /** Champ à qui donner le focus (double clic sur l'en-tête ou le pied de page, T2.16), ou null. */
  field: HeaderFooterField | null;
}

/**
 * État de la boîte « Mise en page » du document affiché.
 * @param ydoc document affiché, ou null pendant le chargement
 * @param onEdit appelé quand un changement est appliqué : du travail est commencé (H1)
 * @param onOpen appelé à l'ouverture : une mise à jour ne recharge pas la page pendant la saisie (H1)
 * @returns `current` (réglages lus à l'ouverture, ou null si la boîte est fermée), `show` (avec le champ
 *   à qui donner le focus, facultatif), `apply`, `close`
 */
export function usePageSetupDialog(ydoc: Y.Doc | null, onEdit: () => void, onOpen: () => void) {
  const [opened, setOpened] = useState<
    (OpenedPageSetup & { ydoc: Y.Doc; focus: Element | null }) | null
  >(null);

  const show = useCallback(
    (field: HeaderFooterField | null = null) => {
      if (!ydoc) return;
      onOpen();
      setOpened({
        ydoc,
        setup: readPageSetup(ydoc),
        headerFooter: readHeaderFooter(ydoc),
        field,
        focus: document.activeElement,
      });
    },
    [ydoc, onOpen],
  );

  const close = useCallback(() => {
    const focus = opened?.focus;
    setOpened(null);
    if (focus instanceof HTMLElement) queueMicrotask(() => focus.focus());
  }, [opened]);

  const apply = useCallback(
    (setup: PageSetup, headerFooter: HeaderFooter) => {
      // Une seule transaction, annulable avec Ctrl/Cmd+Z (critère 5).
      if (opened) {
        opened.ydoc.transact(() => {
          writePageSetup(opened.ydoc, setup);
          writeHeaderFooter(opened.ydoc, headerFooter);
        }, PAGE_SETUP_ORIGIN);
        onEdit();
      }
      close();
    },
    [opened, onEdit, close],
  );

  // Un autre document ouvert entre-temps : la boîte ne s'applique qu'au document où elle a été ouverte.
  const current: OpenedPageSetup | null = opened && opened.ydoc === ydoc ? opened : null;
  return { current, show, apply, close };
}
