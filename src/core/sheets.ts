// Feuilles séparées (PL6) : place de chaque feuille à l'écran et décalage du texte de chaque page, à partir des
// coupures de T2.8 (src/core/pageBreaks.ts). Logique pure, en pixels ; la mesure et l'affichage sont dans
// src/ui/usePageLayout.ts et src/ui/SheetsLayer.tsx.
import type { PageLayout, PageStart } from "./pageBreaks";

/** Espace gris entre deux feuilles, en pixels (critère 1). */
export const SHEET_GAP = 24;

/** Une feuille à l'écran, en pixels depuis le haut de la pile de feuilles (`.nano-page`). */
export interface Sheet {
  /** Numéro de la page (1, 2…). */
  page: number;
  top: number;
  height: number;
}

/** Début d'une page après la première, dans la feuille continue mesurée sans les espaces entre feuilles. */
export interface ContentStart {
  page: number;
  /** Haut du premier bloc ou de la première ligne de la page. */
  top: number;
  /** Bas du dernier bloc ou de la dernière ligne de la page précédente. */
  previousBottom: number;
}

/** Géométrie d'une feuille : zone de texte imprimée et marges affichées, en pixels. */
export interface SheetMetrics {
  /** Hauteur de la zone de texte d'une page imprimée (`textAreaHeight`). */
  textHeight: number;
  /** Marge du haut affichée : du haut de la feuille au haut de l'éditeur. */
  marginTop: number;
  /** Marge du bas affichée. */
  marginBottom: number;
  gap: number;
}

/** Feuilles et décalages du texte. */
export interface SheetPlan {
  sheets: Sheet[];
  /**
   * Hauteur à ajouter avant le texte de chaque page après la première, dans l'ordre des débuts : de quoi finir la
   * feuille précédente, passer l'espace gris et la marge du haut de la feuille suivante.
   */
  shifts: number[];
  /** Haut voulu du texte de chaque page après la première, en pixels depuis le haut de l'éditeur. */
  targets: number[];
  /** Hauteur totale de la pile de feuilles. */
  height: number;
}

/**
 * Place les feuilles et calcule le décalage du texte de chaque page (critères 1 et 2).
 * Une feuille a toujours la hauteur imprimée ; elle ne grandit que si le texte d'une page y est plus haut, dans une
 * fenêtre plus étroite que la feuille imprimée, où il passe davantage à la ligne (critère 9).
 * @param starts débuts des pages 2 et suivantes, mesurés sans les espaces entre feuilles
 * @param contentBottom bas du texte de la dernière page, mesuré de la même façon
 * @param metrics géométrie d'une feuille
 */
export function planSheets(
  starts: readonly ContentStart[],
  contentBottom: number,
  metrics: SheetMetrics,
): SheetPlan {
  const { textHeight, marginTop, marginBottom, gap } = metrics;
  const sheets: Sheet[] = [];
  const shifts: number[] = [];
  const targets: number[] = [];
  let pageTop = 0;
  let sheetTop = 0;
  let shifted = 0;
  const pages = [...starts, null];
  for (const [index, next] of pages.entries()) {
    const bottom = next ? next.previousBottom : contentBottom;
    const inner = Math.max(textHeight, bottom - pageTop);
    const height = marginTop + inner + marginBottom;
    sheets.push({ page: index + 1, top: sheetTop, height });
    sheetTop += height + gap;
    if (!next) break;
    // Le texte de la page suivante commence en haut de la zone de texte de sa feuille.
    const target = sheetTop;
    shifts.push(target - next.top - shifted);
    shifted = target - next.top;
    targets.push(target);
    pageTop = next.top;
  }
  return { sheets, shifts, targets, height: sheetTop - gap };
}

/**
 * Coupures de page dans les coordonnées de l'écran, espaces entre feuilles compris, pour le compteur, le plan et le
 * sommaire (`pageAt`) : chaque page commence au milieu de l'espace gris qui la précède.
 * @param layout coupures calculées
 * @param plan feuilles placées par `planSheets`
 * @param marginTop marge du haut affichée, entre le haut de la feuille et le haut de l'éditeur
 */
export function screenLayout(layout: PageLayout, plan: SheetPlan, marginTop: number): PageLayout {
  const starts: PageStart[] = layout.starts.map((start, index) => {
    const sheet = plan.sheets[index + 1];
    const top = (sheet?.top ?? 0) - marginTop;
    return { page: start.page, y: top - SHEET_GAP / 2, start: top + marginTop };
  });
  return { pageCount: layout.pageCount, starts };
}

/** Numéro de la feuille qui contient une hauteur donnée de la pile de feuilles (1 au-dessus de la première). */
export function sheetAt(sheets: readonly Sheet[], y: number): number {
  let page = 1;
  for (const sheet of sheets) {
    if (sheet.top - SHEET_GAP / 2 <= y) page = sheet.page;
    else break;
  }
  return page;
}
