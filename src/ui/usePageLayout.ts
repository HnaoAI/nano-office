// Feuilles séparées du document affiché (T2.8, PL6) : coupures recalculées au plus une fois par image affichée,
// après une modification, un changement de taille ou de mise en page, toujours à la largeur de la feuille imprimée ;
// espaces entre feuilles posés avant le texte de chaque page, et page visible au milieu de la fenêtre pour le
// compteur « Page 3 sur 7 ». La mesure est dans src/editor/pageMeasure.ts, les coupures dans
// src/core/pageBreaks.ts, les feuilles dans src/core/sheets.ts, les espaces dans src/editor/sheetGaps.ts.
import type { Editor } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
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
import { planSheets, screenLayout, SHEET_GAP, type ContentStart, type Sheet } from "../core/sheets";
import { lineStartPos, measurePage, withTextWidth, type MeasuredPage } from "../editor/pageMeasure";
import {
  createSheetGapElement,
  setSheetGapHeights,
  setSheetGaps,
  SHEET_GAP_CLASS,
  SHEETS_MEASURING_CLASS,
  type SheetGap,
} from "../editor/sheetGaps";

/** Nom de la mesure de performance d'un calcul, lue par les tests d'interface (critère 4). */
export const PAGE_LAYOUT_MEASURE = "nano-page-layout";

/** Classe des espaces posés à la main entre deux lignes d'un sommaire. */
const MANUAL_GAP_CLASS = "nano-sheet-gap-manual";

/** Écart toléré, en pixels, entre la place voulue du texte d'une page et sa place affichée. */
const TOLERANCE = 0.5;

/** Corrections successives au plus, sans autre changement, pour ne jamais boucler. */
const MAX_CORRECTIONS = 3;

/** Feuilles à afficher : coupures (à l'écran), feuilles, décalage de la zone de texte, page visible. */
export interface PageMarks {
  /** Coupures en pixels depuis le haut de l'éditeur, espaces entre feuilles compris (`pageAt`). */
  layout: PageLayout;
  /** Feuilles, en pixels depuis le haut de la pile (`.nano-page`). */
  sheets: Sheet[];
  /** Hauteur de la pile de feuilles. */
  height: number;
  /** Haut de la zone de texte, en pixels depuis le haut de la feuille (`.nano-page`). */
  offset: number;
  /** Page visible au milieu de la fenêtre (critère 5). */
  current: number;
}

const EMPTY: PageMarks = {
  layout: { pageCount: 1, starts: [] },
  sheets: [],
  height: 0,
  offset: 0,
  current: 1,
};

/** Début de page trouvé dans la feuille continue, et l'espace à poser avant lui. */
interface FoundStart {
  start: ContentStart;
  gap: SheetGap | null;
  /** Élément devant lequel poser l'espace à la main (ligne d'un sommaire). */
  manual: HTMLElement | null;
}

/**
 * Trouve, pour chaque coupure, le haut du texte de la page, le bas de la précédente et la position du document où
 * poser l'espace : avant un bloc, ou avant la première lettre d'une ligne d'un paragraphe coupé.
 * Un bloc plus haut qu'une page (image, tableau d'une seule ligne) est coupé sans espace : il passe d'une feuille à
 * l'autre, comme le ferait l'impression.
 * TODO(PL6) : critère 2 partiel, soumis au PO : un tel bloc traverse la coupure sans espace gris à l'écran.
 */
function findStarts(view: EditorView, layout: PageLayout, shown: MeasuredPage): FoundStart[] {
  const origin = view.dom.getBoundingClientRect().top;
  return layout.starts.map(({ page, y }) => {
    const index = shown.units.findIndex((unit) => unit.bottom > y + TOLERANCE);
    const unit = shown.units[index];
    const element = shown.elements[index];
    const pos = shown.positions[index];
    if (unit && y <= unit.top + TOLERANCE) {
      const previous = shown.units[index - 1];
      return {
        start: { page, top: unit.top, previousBottom: previous?.bottom ?? unit.top },
        gap: pos === null || pos === undefined ? null : { page, pos },
        manual: pos === null && element ? element : null,
      };
    }
    let gap: SheetGap | null = null;
    if (unit?.kind === "text" && element && pos !== null && pos !== undefined) {
      const found = lineStartPos(view, element, pos, origin + y);
      const node = view.state.doc.nodeAt(pos);
      if (found !== null && node && found > pos && found < pos + node.nodeSize - 1) {
        gap = { page, pos: found };
      }
    }
    return { start: { page, top: y, previousBottom: y }, gap, manual: null };
  });
}

/** Haut affiché du texte qui suit un espace : la ligne qui suit dans un paragraphe, sinon le bloc suivant. */
function shownTextTop(element: HTMLElement): number {
  const box = element.getBoundingClientRect();
  if (element.dataset.inline === "true") return box.bottom;
  return element.nextElementSibling?.getBoundingClientRect().top ?? box.bottom;
}

/**
 * Calcule les feuilles d'un éditeur.
 * INVARIANT : rien n'est écrit dans le document ; les espaces sont des décorations, les feuilles un calque
 * (critère 3).
 * @param editor éditeur affiché
 * @param sheet pile de feuilles du document (`.nano-page`), ou null avant son affichage
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
    let current: PageMarks = EMPTY;
    let frame = 0;
    let scrollFrame = 0;
    let corrections = 0;
    /** Haut voulu du texte de chaque page, par numéro de page, en pixels depuis le haut de l'éditeur. */
    let targets = new Map<number, number>();
    /** Correction de chaque espace, par numéro de page : marges des blocs autour de l'espace. */
    const adjust = new Map<number, number>();

    const currentPage = () => {
      const top = view.dom.getBoundingClientRect().top;
      return pageAt(current.layout, window.innerHeight / 2 - top);
    };
    const publish = (next: Omit<PageMarks, "current">) => {
      current = { ...next, current: current.current };
      current = { ...current, current: currentPage() };
      setMarks((previous) =>
        previous.layout === current.layout &&
        previous.sheets === current.sheets &&
        previous.offset === current.offset &&
        previous.current === current.current
          ? previous
          : current,
      );
    };

    /** Écart entre la place voulue du texte de chaque page et sa place affichée, lu avant toute modification. */
    const learnCorrections = (): boolean => {
      const origin = view.dom.getBoundingClientRect().top;
      let moved = false;
      for (const element of view.dom.querySelectorAll<HTMLElement>(`.${SHEET_GAP_CLASS}`)) {
        const page = Number(element.dataset.page);
        const target = targets.get(page);
        if (target === undefined) continue;
        const error = target - (shownTextTop(element) - origin);
        if (Math.abs(error) <= TOLERANCE) continue;
        adjust.set(page, (adjust.get(page) ?? 0) + error);
        moved = true;
      }
      return moved;
    };

    const compute = () => {
      frame = 0;
      if (view.isDestroyed) return;
      performance.mark(`${PAGE_LAYOUT_MEASURE}-start`);
      const corrected = learnCorrections();
      corrections = corrected ? corrections + 1 : 0;

      // Mesure du texte d'un seul tenant : espaces entre feuilles cachés (critère 2).
      for (const element of view.dom.querySelectorAll(`.${MANUAL_GAP_CLASS}`)) element.remove();
      // Sur la pile et non sur l'éditeur : ProseMirror prendrait un changement de ses attributs pour une frappe.
      sheet.classList.add(SHEETS_MEASURING_CLASS);
      let found: FoundStart[];
      let layout: PageLayout;
      let contentBottom: number;
      let offset: number;
      let marginBottom: number;
      try {
        const shown = measurePage(view);
        if (Math.abs(view.dom.getBoundingClientRect().width - printWidth) <= 1) {
          layout = computePageBreaks(shown.units, pageHeight, shown.linesOf);
        } else {
          // Feuille plus étroite que l'impression : coupures calculées à la largeur imprimée (T2.8, critère 3),
          // puis placées entre les mêmes blocs ou les mêmes lignes à l'écran.
          const printed = withTextWidth(view, printWidth, () => {
            const page = measurePage(view);
            return {
              units: page.units,
              layout: computePageBreaks(page.units, pageHeight, page.linesOf),
            };
          });
          layout = placeOnScreen(printed.layout, printed.units, shown.units, shown.linesOf);
        }
        found = findStarts(view, layout, shown);
        contentBottom = shown.units.at(-1)?.bottom ?? 0;
        // Lus avant de remontrer les espaces, qui ne déplacent pas le haut de la zone de texte : les lire après
        // forcerait le navigateur à refaire la mise en page de tout le document (P1, critère 8).
        offset = view.dom.getBoundingClientRect().top - sheet.getBoundingClientRect().top;
        marginBottom = Number.parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
      } finally {
        sheet.classList.remove(SHEETS_MEASURING_CLASS);
      }

      const plan = planSheets(
        found.map(({ start }) => start),
        contentBottom,
        { textHeight: pageHeight, marginTop: offset, marginBottom, gap: SHEET_GAP },
      );
      const heights = new Map<number, number>();
      targets = new Map();
      found.forEach(({ start }, index) => {
        const shift = plan.shifts[index] ?? 0;
        heights.set(start.page, Math.max(0, shift + (adjust.get(start.page) ?? 0)));
        targets.set(start.page, plan.targets[index] ?? 0);
      });
      for (const page of adjust.keys()) if (!heights.has(page)) adjust.delete(page);
      setSheetGaps(
        view,
        found.flatMap(({ gap }) => (gap ? [gap] : [])),
      );
      setSheetGapHeights(view, heights);
      for (const { start, manual } of found) {
        if (!manual) continue;
        const element = createSheetGapElement(view, start.page, false);
        element.classList.add(MANUAL_GAP_CLASS);
        manual.before(element);
      }

      const screen = screenLayout(layout, plan, offset);
      // Mêmes coupures : l'objet précédent est gardé, pour ne pas redessiner ce qui en dépend.
      const sameLayout = JSON.stringify(screen) === JSON.stringify(current.layout);
      const sameSheets = JSON.stringify(plan.sheets) === JSON.stringify(current.sheets);
      performance.measure(PAGE_LAYOUT_MEASURE, `${PAGE_LAYOUT_MEASURE}-start`);
      publish({
        layout: sameLayout ? current.layout : screen,
        sheets: sameSheets ? current.sheets : plan.sheets,
        height: plan.height,
        offset,
      });
      // Les marges des blocs autour d'un espace ne se connaissent qu'une fois affichées : l'image suivante
      // corrige l'écart, s'il y en a un.
      if (corrected && corrections < MAX_CORRECTIONS) schedule();
    };
    // Au plus un calcul par image affichée, quel que soit le nombre de modifications (T2.8, critère 4).
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(compute);
    };
    const onScroll = () => {
      if (scrollFrame !== 0) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        publish(current);
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
      if (!view.isDestroyed) setSheetGaps(view, []);
      for (const element of view.dom.querySelectorAll(`.${MANUAL_GAP_CLASS}`)) element.remove();
    };
  }, [editor, sheet, setup]);

  return marks;
}
