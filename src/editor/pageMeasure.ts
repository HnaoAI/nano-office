// Mesure de la page affichée pour les repères de page (T2.8) : position de chaque morceau (paragraphe,
// titre, élément de liste, ligne de tableau, image, saut de page, encadré entier (T2.19), titre et lignes d'un sommaire
// (T2.17)) et, seulement pour un paragraphe qui
// traverse une fin de page, position de ses lignes. Le calcul des coupures est dans src/core/pageBreaks.ts.
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { IMAGE_NODE } from "../core/images";
import { PAGE_BREAK_NODE } from "../core/pageBreakSchema";
import { CALLOUT_NODE } from "../core/calloutSchema";
import { TOC_NODE } from "../core/tocSchema";
import type { LineBox, PageUnit, PageUnitKind } from "../core/pageBreaks";

/** Lignes d'un paragraphe déjà mesurées, relatives au haut du paragraphe, pour une taille donnée. */
interface CachedLines {
  width: number;
  height: number;
  lines: LineBox[];
}

/** Un morceau à mesurer : son nœud et l'élément qui l'affiche. */
interface PieceToMeasure {
  kind: PageUnitKind;
  node: ProseMirrorNode;
  element: HTMLElement;
}

/** Page mesurée : morceaux dans l'ordre du document, et lignes d'un paragraphe à la demande. */
export interface MeasuredPage {
  units: PageUnit[];
  linesOf: (index: number) => LineBox[];
}

/**
 * Lignes déjà mesurées, par nœud du document. Un nœud ProseMirror ne change jamais : un paragraphe
 * modifié est un nouveau nœud, et seul lui est remesuré (critère 4). La taille de l'élément est gardée,
 * pour remesurer si la largeur de la page ou une police chargée plus tard change ses lignes. Deux tailles
 * au plus par nœud : celle de l'écran et celle de l'impression (`withTextWidth`).
 */
const lineCache = new WeakMap<ProseMirrorNode, CachedLines[]>();

/** Élément qui affiche le nœud à la position donnée, ou null (nœud pas encore affiché). */
function elementAt(view: EditorView, pos: number): HTMLElement | null {
  const dom = view.nodeDOM(pos);
  return dom instanceof HTMLElement ? dom : null;
}

/** Morceaux d'une liste : chaque paragraphe de ses éléments, listes imbriquées comprises. */
function listPieces(view: EditorView, list: ProseMirrorNode, pos: number, out: PieceToMeasure[]) {
  list.forEach((item, itemOffset) => {
    const itemPos = pos + 1 + itemOffset;
    item.forEach((child, childOffset) => {
      const childPos = itemPos + 1 + childOffset;
      if (child.isTextblock) {
        const element = elementAt(view, childPos);
        if (element) out.push({ kind: "text", node: child, element });
      } else {
        listPieces(view, child, childPos, out);
      }
    });
  });
}

/** Morceaux du document, dans l'ordre : une ligne de tableau ou un élément de liste à la fois. */
function pieces(view: EditorView): PieceToMeasure[] {
  const out: PieceToMeasure[] = [];
  view.state.doc.forEach((node, pos) => {
    const name = node.type.name;
    if (name === "table") {
      node.forEach((row, rowOffset) => {
        const element = elementAt(view, pos + 1 + rowOffset);
        if (element) out.push({ kind: "keep", node: row, element });
      });
      return;
    }
    if (name === "bulletList" || name === "orderedList") {
      listPieces(view, node, pos, out);
      return;
    }
    if (name === TOC_NODE) {
      // Sommaire (T2.17) : son titre ne reste jamais seul en bas de page, puis une ligne à la fois, comme
      // à l'impression (print.css).
      const element = elementAt(view, pos);
      const title = element?.querySelector<HTMLElement>(".nano-toc-title");
      if (title) out.push({ kind: "heading", node, element: title });
      for (const line of element?.querySelectorAll<HTMLElement>(".nano-toc-entry") ?? []) {
        out.push({ kind: "keep", node, element: line });
      }
      return;
    }
    const element = elementAt(view, pos);
    if (!element) return;
    let kind: PageUnitKind = "keep";
    if (name === "heading") kind = "heading";
    else if (name === PAGE_BREAK_NODE) kind = "break";
    else if (node.isTextblock) kind = "text";
    else if (name === IMAGE_NODE) kind = "keep";
    // Encadré (T2.19, critère 5) : jamais coupé s'il tient sur une page, comme à l'impression (`break-inside: avoid`).
    else if (name === CALLOUT_NODE) kind = "keep";
    out.push({ kind, node, element });
  });
  return out;
}

/**
 * Lignes d'un paragraphe affiché, relatives à son haut. Les rectangles des caractères (`getClientRects`) ne
 * couvrent que les caractères : la limite entre deux lignes est prise au milieu de l'espace qui les
 * sépare, la première ligne commence au haut du paragraphe et la dernière finit à son bas.
 */
function measureLines(element: HTMLElement, box: DOMRect): LineBox[] {
  // Rectangles des caractères, nœud de texte par nœud de texte : ceux d'une plage entière compteraient
  // aussi les boîtes des éléments qu'elle contient.
  const doc = element.ownerDocument;
  const rects: DOMRect[] = [];
  const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const range = doc.createRange();
    range.selectNodeContents(node);
    for (const rect of Array.from(range.getClientRects())) if (rect.height > 0) rects.push(rect);
  }
  rects.sort((a, b) => a.top - b.top);
  // Rectangles regroupés en lignes : ceux qui se chevauchent verticalement sont sur la même ligne.
  const lines: { top: number; bottom: number }[] = [];
  for (const rect of rects) {
    const last = lines.at(-1);
    const middle = (rect.top + rect.bottom) / 2;
    if (last && middle < last.bottom) {
      last.top = Math.min(last.top, rect.top);
      last.bottom = Math.max(last.bottom, rect.bottom);
    } else {
      lines.push({ top: rect.top, bottom: rect.bottom });
    }
  }
  if (lines.length <= 1) return [];
  return lines.map((line, index) => {
    const previous = lines[index - 1];
    const next = lines[index + 1];
    const top = previous ? (previous.bottom + line.top) / 2 : box.top;
    const bottom = next ? (line.bottom + next.top) / 2 : box.bottom;
    return { top: top - box.top, bottom: bottom - box.top };
  });
}

/**
 * Mesure la page affichée par l'éditeur. Les positions sont en pixels depuis le haut de la zone de texte
 * (le haut de l'éditeur). Les morceaux sont lus en une fois, après une seule mise en page du navigateur ;
 * les lignes ne sont mesurées que pour les paragraphes qui traversent une fin de page, et gardées tant
 * que le paragraphe ne change pas (critère 4).
 * @param view vue ProseMirror de l'éditeur
 */
export function measurePage(view: EditorView): MeasuredPage {
  const origin = view.dom.getBoundingClientRect().top;
  const measured = pieces(view).map((piece) => ({
    piece,
    box: piece.element.getBoundingClientRect(),
  }));
  const units = measured.map(({ piece, box }) => ({
    kind: piece.kind,
    top: box.top - origin,
    bottom: box.bottom - origin,
  }));
  const linesOf = (index: number): LineBox[] => {
    const entry = measured[index];
    if (!entry) return [];
    const { piece, box } = entry;
    const entries = lineCache.get(piece.node) ?? [];
    let cached = entries.find((entry) => entry.width === box.width && entry.height === box.height);
    if (!cached) {
      cached = { width: box.width, height: box.height, lines: measureLines(piece.element, box) };
      lineCache.set(piece.node, [cached, ...entries].slice(0, 2));
    }
    const top = box.top - origin;
    return cached.lines.map((line) => ({ top: top + line.top, bottom: top + line.bottom }));
  };
  return { units, linesOf };
}

/**
 * Lance `measure` pendant que la zone de texte a la largeur de la feuille imprimée, puis lui rend sa
 * largeur. Dans une fenêtre plus étroite que la feuille, le texte passe à la ligne ailleurs qu'à
 * l'impression : les coupures sont donc calculées à la largeur imprimée (critère 3). Le tout se fait
 * dans la même image, avant l'affichage : rien ne bouge à l'écran.
 * @param view vue ProseMirror de l'éditeur
 * @param width largeur de la zone de texte imprimée, en pixels
 * @param measure mesure et calcul à faire à cette largeur ; rien ne doit en être gardé qui dépende du DOM
 */
export function withTextWidth<T>(view: EditorView, width: number, measure: () => T): T {
  const { style } = view.dom;
  const previous = { width: style.width, maxWidth: style.maxWidth, flex: style.flex };
  style.width = `${String(width)}px`;
  style.maxWidth = "none";
  style.flex = "none";
  try {
    return measure();
  } finally {
    style.width = previous.width;
    style.maxWidth = previous.maxWidth;
    style.flex = previous.flex;
  }
}
