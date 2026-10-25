// Sommaires du document affiché (T2.17) : numéro de page de chaque titre, d'après les repères de T2.8,
// remesuré après chaque modification et quand les pages bougent (critère 3), et clic sur une ligne qui
// amène au titre sous la barre figée (critère 2). Les lignes elles-mêmes sont dans src/editor/toc.ts.
import type { Editor } from "@tiptap/react";
import { useEffect } from "react";
import type * as Y from "yjs";
import { pageAt, type PageLayout } from "../core/pageBreaks";
import { hasToc, tocEntries, type TocEntry } from "../core/toc";
import { goToHeading } from "../editor/outline";
import { TOC_GO_EVENT, tocState } from "../editor/toc";
import { rememberTocPages } from "./tocPages";

/**
 * Numéro de page de chaque titre de premier niveau, par identifiant de bloc.
 * @param editor éditeur affiché
 * @param layout coupures de page de T2.8
 */
function measureHeadingPages(editor: Editor, layout: PageLayout): Map<string, number> {
  const view = editor.view;
  const offsets: number[] = [];
  view.state.doc.forEach((_node, offset) => offsets.push(offset));
  const top = view.dom.getBoundingClientRect().top;
  const pages = new Map<string, number>();
  for (const entry of tocEntries(view.state.doc)) {
    const pos = offsets[entry.index];
    const element = pos === undefined ? null : view.nodeDOM(pos);
    if (entry.id === null || !(element instanceof HTMLElement)) continue;
    pages.set(entry.id, pageAt(layout, element.getBoundingClientRect().top - top));
  }
  return pages;
}

/**
 * Tient à jour les numéros de page des sommaires d'un éditeur.
 * INVARIANT : rien n'est écrit dans le document ; les numéros sont affichés par la vue du sommaire.
 * @param editor éditeur affiché
 * @param ydoc document affiché, sous lequel les numéros sont retenus pour l'export Word
 * @param layout coupures de page calculées par T2.8 (`usePageLayout`)
 * @param coveredTop hauteur cachée par la partie figée, pour arrêter le titre atteint dessous (M1)
 */
export function useTableOfContents(
  editor: Editor,
  ydoc: Y.Doc,
  layout: PageLayout,
  coveredTop: () => number,
): void {
  // Numéros remesurés au plus une fois par image, seulement si le document contient un sommaire.
  useEffect(() => {
    const state = tocState(editor);
    if (!state) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (editor.isDestroyed || !hasToc(editor.state.doc)) return;
      const pages = measureHeadingPages(editor, layout);
      state.setPages(pages);
      rememberTocPages(ydoc, pages);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    schedule();
    editor.on("update", schedule);
    return () => {
      cancelAnimationFrame(frame);
      editor.off("update", schedule);
    };
  }, [editor, ydoc, layout]);

  // Clic sur une ligne d'un sommaire : le curseur va au début du titre.
  useEffect(() => {
    const dom = editor.view.dom;
    const onGo = (event: Event) => {
      const entry = (event as CustomEvent<TocEntry>).detail;
      goToHeading(editor, entry, coveredTop);
    };
    dom.addEventListener(TOC_GO_EVENT, onGo);
    return () => dom.removeEventListener(TOC_GO_EVENT, onGo);
  }, [editor, coveredTop]);
}
