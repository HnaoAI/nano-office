// Repères de page du document affiché (T2.8) : coupures recalculées au plus une fois par image affichée,
// après une modification, un changement de taille ou de mise en page, toujours à la largeur de la feuille
// imprimée, et page visible au milieu de la fenêtre pour le compteur « Page 3 sur 7 ». La mesure est dans
// src/editor/pageMeasure.ts, le calcul dans src/core/pageBreaks.ts.
import type { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";
import {
  computePageBreaks,
  pageAt,
  placeOnScreen,
  textAreaHeight,
  textAreaWidth,
  type PageLayout,
} from "../core/pageBreaks";
import type { PageSetup } from "../core/pageSetup";
import { measurePage, withTextWidth } from "../editor/pageMeasure";

/** Nom de la mesure de performance d'un calcul, lue par les tests d'interface (critère 4). */
export const PAGE_LAYOUT_MEASURE = "nano-page-layout";

/** Repères à afficher : coupures, décalage de la zone de texte dans la feuille, page visible. */
export interface PageMarks {
  layout: PageLayout;
  /** Haut de la zone de texte, en pixels depuis le haut de la feuille (`.nano-page`). */
  offset: number;
  /** Page visible au milieu de la fenêtre (critère 5). */
  current: number;
}

const EMPTY: PageMarks = { layout: { pageCount: 1, starts: [] }, offset: 0, current: 1 };

/**
 * Calcule les repères de page d'un éditeur.
 * INVARIANT : rien n'est écrit dans le document ; les repères sont affichés à côté (critère 9).
 * @param editor éditeur affiché
 * @param sheet feuille du document (`.nano-page`), ou null avant son affichage
 * @param setup mise en page du document (T2.5)
 */
export function usePageLayout(
  editor: Editor,
  sheet: HTMLElement | null,
  setup: PageSetup,
): PageMarks {
  const [marks, setMarks] = useState<PageMarks>(EMPTY);

  useEffect(() => {
    if (!sheet) return;
    const view = editor.view;
    const pageHeight = textAreaHeight(setup);
    const printWidth = textAreaWidth(setup);
    let layout: PageLayout = EMPTY.layout;
    let offset = 0;
    let frame = 0;
    let scrollFrame = 0;

    const currentPage = () => {
      const top = view.dom.getBoundingClientRect().top;
      return pageAt(layout, window.innerHeight / 2 - top);
    };
    const publish = () => {
      const current = currentPage();
      setMarks((previous) =>
        previous.layout === layout && previous.offset === offset && previous.current === current
          ? previous
          : { layout, offset, current },
      );
    };
    const compute = () => {
      frame = 0;
      if (view.isDestroyed) return;
      performance.mark(`${PAGE_LAYOUT_MEASURE}-start`);
      const shown = measurePage(view);
      let next: PageLayout;
      if (Math.abs(view.dom.getBoundingClientRect().width - printWidth) <= 1) {
        next = computePageBreaks(shown.units, pageHeight, shown.linesOf);
      } else {
        // Feuille plus étroite que l'impression : coupures calculées à la largeur imprimée (critère 3),
        // puis placées entre les mêmes blocs ou les mêmes lignes à l'écran.
        const printed = withTextWidth(view, printWidth, () => {
          const page = measurePage(view);
          return {
            units: page.units,
            layout: computePageBreaks(page.units, pageHeight, page.linesOf),
          };
        });
        next = placeOnScreen(printed.layout, printed.units, shown.units, shown.linesOf);
      }
      offset = view.dom.getBoundingClientRect().top - sheet.getBoundingClientRect().top;
      // Mêmes coupures : l'objet précédent est gardé, pour ne pas redessiner les repères.
      if (JSON.stringify(next) !== JSON.stringify(layout)) layout = next;
      performance.measure(PAGE_LAYOUT_MEASURE, `${PAGE_LAYOUT_MEASURE}-start`);
      publish();
    };
    // Au plus un calcul par image affichée, quel que soit le nombre de modifications (critère 4).
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(compute);
    };
    const onScroll = () => {
      if (scrollFrame !== 0) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        publish();
      });
    };

    schedule();
    editor.on("update", schedule);
    // Les propositions de l'assistant et les images chargées changent la hauteur sans modifier le texte.
    const resize = new ResizeObserver(schedule);
    resize.observe(view.dom);
    void document.fonts.ready.then(schedule);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(scrollFrame);
      editor.off("update", schedule);
      resize.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [editor, sheet, setup]);

  return marks;
}
