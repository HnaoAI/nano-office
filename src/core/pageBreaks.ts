// Coupures de page d'un document (T2.8) : où finit chaque page de la feuille continue, avec les règles de
// l'impression de Chromium (T2.6). Logique pure, à partir de hauteurs déjà mesurées : la mesure de la
// page affichée est dans src/editor/pageMeasure.ts.
import { pageSize, type PageSetup } from "./pageSetup";

/** Pixels CSS par centimètre (96 par pouce), à l'écran comme à l'impression. */
export const PX_PER_CM = 96 / 2.54;

/**
 * Lignes gardées au moins en bas d'une page (`orphans`) et en haut de la suivante (`widows`) quand un
 * paragraphe est coupé : 2, la valeur par défaut du CSS, celle qu'applique Chromium à l'impression.
 */
export const ORPHANS = 2;
export const WIDOWS = 2;

/** Écart toléré entre deux mesures, en pixels : les positions mesurées ne sont pas des entiers. */
const EPSILON = 0.5;

/**
 * Nature d'un morceau de la page, pour les règles de coupure :
 * - `text` : paragraphe ou élément de liste, coupé entre deux lignes ;
 * - `heading` : titre, jamais coupé ni laissé seul en bas de page (`break-after: avoid`) ;
 * - `keep` : ligne de tableau ou image, jamais coupée (`break-inside: avoid`) ;
 * - `break` : saut de page manuel, le morceau suivant commence une nouvelle page.
 */
export type PageUnitKind = "text" | "heading" | "keep" | "break";

/** Un morceau mesuré : haut et bas de sa boîte, en pixels depuis le haut de la zone de texte. */
export interface PageUnit {
  kind: PageUnitKind;
  top: number;
  bottom: number;
}

/** Une ligne d'un paragraphe : haut et bas de sa boîte, en pixels depuis le haut de la zone de texte. */
export interface LineBox {
  top: number;
  bottom: number;
}

/** Début d'une page, après la première. */
export interface PageStart {
  /** Numéro de la page qui commence (2, 3…). */
  page: number;
  /** Hauteur du repère, entre la dernière ligne de la page précédente et la première de celle-ci. */
  y: number;
  /** Haut du contenu de la page dans la feuille continue. */
  start: number;
}

/** Pages d'un document. */
export interface PageLayout {
  pageCount: number;
  /** Débuts des pages 2 et suivantes, dans l'ordre. */
  starts: PageStart[];
}

/**
 * Hauteur de la zone de texte d'une page A4, en pixels : la feuille sans les marges du haut et du bas,
 * dans l'orientation du document (T2.5).
 */
export function textAreaHeight(setup: PageSetup): number {
  const { height } = pageSize(setup.orientation);
  return (height - setup.margins.top - setup.margins.bottom) * PX_PER_CM;
}

/**
 * Calcule les coupures de page, comme l'impression de Chromium (T2.8, critère 3) :
 * - un morceau qui dépasse le bas de la page passe à la suivante ; un paragraphe est coupé entre deux
 *   lignes, avec au moins deux lignes de chaque côté (sinon il passe en entier à la page suivante) ;
 * - une ligne de tableau, une image ou un titre ne sont pas coupés ;
 * - un titre n'est jamais seul en bas de page : il passe à la page suivante avec ce qui le suit ;
 * - un saut de page manuel commence une nouvelle page ;
 * - un morceau plus haut qu'une page, seul sur sa page, est coupé là où la page finit.
 * La marge sous le dernier bloc d'une page ne compte pas : l'impression la retire à la coupure.
 * @param units morceaux de la page, dans l'ordre du document
 * @param pageHeight hauteur de la zone de texte d'une page, en pixels (`textAreaHeight`)
 * @param linesOf lignes du paragraphe d'indice donné ; appelée seulement pour un paragraphe qui
 *   traverse une fin de page, pour ne mesurer que le nécessaire (critère 4). Une liste vide vaut une
 *   seule ligne, de la hauteur du paragraphe.
 * @returns nombre de pages et début de chaque page après la première ; une page au moins
 */
export function computePageBreaks(
  units: readonly PageUnit[],
  pageHeight: number,
  linesOf: (index: number) => readonly LineBox[],
): PageLayout {
  const starts: PageStart[] = [];
  if (!(pageHeight > 0)) return { pageCount: 1, starts };
  let pageStart = 0;
  let hasContent = false;
  const newPage = (start: number, y: number) => {
    starts.push({ page: starts.length + 2, y, start });
    pageStart = start;
    hasContent = false;
  };
  // Coupure avant le morceau `index`, ou avant les titres qui le précèdent sur la même page.
  const breakBefore = (index: number): number => {
    let first = index;
    while (first > 0) {
      const previous = units[first - 1];
      if (previous?.kind !== "heading" || previous.top <= pageStart + EPSILON) break;
      first--;
    }
    const unit = units[first];
    const previous = units[first - 1];
    const top = unit?.top ?? pageStart;
    newPage(top, previous ? (previous.bottom + top) / 2 : top);
    return first;
  };

  let index = 0;
  while (index < units.length) {
    const unit = units[index];
    if (!unit) break;
    const limit = pageStart + pageHeight;
    if (unit.kind === "break") {
      // Un saut de page en tête de document ne crée pas de page vide, comme à l'impression.
      if (hasContent || starts.length > 0) {
        const next = units[index + 1];
        newPage(next ? next.top : unit.bottom, next ? (unit.bottom + next.top) / 2 : unit.bottom);
      }
      index++;
      continue;
    }
    if (unit.bottom <= limit + EPSILON) {
      hasContent = true;
      index++;
      continue;
    }
    const firstOnPage = unit.top <= pageStart + EPSILON;
    if (unit.kind !== "text") {
      if (!firstOnPage) index = breakBefore(index);
      // Plus haut qu'une page, seul sur sa page : coupé au bas de la page.
      else newPage(limit, limit);
      continue;
    }
    const measured = linesOf(index);
    const lines = (measured.length > 0 ? measured : [unit]).filter(
      (line) => line.top >= pageStart - EPSILON,
    );
    const continued = lines.length < Math.max(measured.length, 1);
    const fitting = lines.filter((line) => line.bottom <= limit + EPSILON).length;
    let kept = Math.min(fitting, lines.length - WIDOWS);
    if (kept < ORPHANS) {
      if (!firstOnPage && !continued) {
        index = breakBefore(index);
        continue;
      }
      // Paragraphe seul sur sa page : coupé au plus près du bas, même sans deux lignes de chaque côté.
      kept = Math.max(1, fitting);
    }
    const next = lines[kept];
    if (next && kept < lines.length) newPage(next.top, next.top);
    else newPage(limit, limit);
  }
  return { pageCount: starts.length + 1, starts };
}

/**
 * Numéro de la page qui contient une hauteur donnée de la feuille continue (critère 5).
 * Au-dessus du premier repère, c'est la page 1.
 */
export function pageAt(layout: PageLayout, y: number): number {
  let page = 1;
  for (const start of layout.starts) {
    if (start.y <= y) page = start.page;
    else break;
  }
  return page;
}

/** Texte du compteur du pied de page : « Page 3 sur 7 » (critère 5). */
export function pageCounterText(page: number, pageCount: number): string {
  return `Page ${String(page)} sur ${String(pageCount)}`;
}
