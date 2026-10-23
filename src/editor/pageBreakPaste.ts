// Sauts de page collés depuis une autre application (T2.8, critère 8) : Word et Google Docs les marquent
// `page-break-before: always`. Préparation du HTML avant sa lecture par le schéma, appelée par clipboard.ts.
import { isPageBreakStyle, PAGE_BREAK_ATTRIBUTE } from "../core/pageBreakSchema";

/** Blocs qu'un saut de page de Word coupe en deux. */
const SPLIT_BLOCKS = "p, h1, h2, h3, h4, h5, h6, div";

/**
 * Coupe le bloc qui contient `marker` (un `<br>` de Word) : ce qui précède reste, ce qui suit passe dans
 * une copie du bloc, et un saut de page de Nano Buro les sépare. Un bloc vidé disparaît.
 */
function splitAtPageBreak(marker: Element, pageBreak: HTMLElement): void {
  const block = marker.parentElement?.closest(SPLIT_BLOCKS);
  if (!block) {
    marker.replaceWith(pageBreak);
    return;
  }
  const doc = marker.ownerDocument;
  const tail = doc.createRange();
  tail.setStartAfter(marker);
  tail.setEnd(block, block.childNodes.length);
  const rest = tail.extractContents();
  marker.remove();
  block.after(pageBreak);
  const isEmpty = (element: Element | DocumentFragment) =>
    (element.textContent ?? "").trim() === "" && !element.querySelector("img");
  if (!isEmpty(rest)) {
    const copy = block.cloneNode(false) as Element;
    copy.append(rest);
    pageBreak.after(copy);
  }
  if (isEmpty(block)) block.remove();
}

/**
 * Sauts de page d'une autre application (T2.8, critère 8), marqués `page-break-before: always` ou
 * `break-before: page` : un `<br>` (Word) ou un `<hr>` (Google Docs) devient un saut de page de Nano
 * Buro, qui coupe le paragraphe où il se trouve ; un autre élément (un paragraphe de Word) est précédé
 * d'un saut de page. ProseMirror ne lit pas un bloc à l'intérieur d'un paragraphe, d'où ce travail ici.
 * @param body corps du HTML collé, modifié sur place
 */
export function convertPageBreaks(body: HTMLElement): void {
  for (const element of Array.from(body.querySelectorAll("[style]"))) {
    if (!element.isConnected || !isPageBreakStyle(element.getAttribute("style"))) continue;
    // Dans une cellule ou une liste, où le schéma refuse un saut de page : ProseMirror couperait le
    // tableau ou la liste pour le placer. Le saut de page est alors ignoré.
    if (element.closest("td, th, li")) {
      if (element.tagName === "BR" || element.tagName === "HR") element.remove();
      continue;
    }
    const pageBreak = body.ownerDocument.createElement("div");
    pageBreak.setAttribute(PAGE_BREAK_ATTRIBUTE, "");
    if (element.tagName === "BR" || element.tagName === "HR") splitAtPageBreak(element, pageBreak);
    else element.before(pageBreak);
  }
}
