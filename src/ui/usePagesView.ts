// Ouverture de la vue des pages (PL6, critères 12 à 14) : page du curseur à l'ouverture, aller en haut d'une page
// choisie, sous la partie figée, le curseur au début de son texte, et retour du focus dans l'éditeur.
import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { useCallback, useState } from "react";
import { pageAt } from "../core/pageBreaks";
import type { PageMarks } from "./usePageLayout";

/** Espace laissé entre la partie figée et le haut de la feuille atteinte, en pixels. */
const GAP_BELOW_BAR = 16;

/** État de la vue des pages. */
export interface PagesView {
  open: boolean;
  /** Page du curseur au moment de l'ouverture. */
  current: number;
  show: () => void;
  close: () => void;
  /** Ferme la vue et amène en haut de la page `page`. */
  goTo: (page: number) => void;
}

/**
 * Vue des pages d'un éditeur.
 * @param editor éditeur affiché
 * @param pile pile des feuilles (`.nano-page`)
 * @param marks feuilles calculées par `usePageLayout`
 * @param coveredTop hauteur cachée par la partie figée en haut de la fenêtre (M1)
 */
export function usePagesView(
  editor: Editor,
  pile: HTMLElement | null,
  marks: PageMarks,
  coveredTop: () => number,
): PagesView {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(1);

  const show = useCallback(() => {
    const view = editor.view;
    const top = view.dom.getBoundingClientRect().top;
    const caret = view.coordsAtPos(view.state.selection.head).top;
    setCurrent(pageAt(marks.layout, caret - top));
    setOpen(true);
  }, [editor, marks.layout]);

  const close = useCallback(() => {
    setOpen(false);
    editor.view.focus();
  }, [editor]);

  const goTo = useCallback(
    (page: number) => {
      setOpen(false);
      const sheet = marks.sheets[page - 1];
      if (!pile || !sheet) return;
      const pileTop = pile.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: pileTop + sheet.top - coveredTop() - GAP_BELOW_BAR });
      // Curseur au début du texte de la page, sans faire défiler de nouveau.
      const view = editor.view;
      const textTop = pile.getBoundingClientRect().top + sheet.top + marks.offset;
      const found = view.posAtCoords({
        left: view.dom.getBoundingClientRect().left + 1,
        top: textTop + 4,
      });
      view.focus();
      if (found) {
        const $pos = view.state.doc.resolve(found.pos);
        view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)));
      }
    },
    [editor, pile, marks.sheets, marks.offset, coveredTop],
  );

  return { open, current, show, close, goTo };
}
