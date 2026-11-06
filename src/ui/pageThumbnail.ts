// Contenu d'une miniature de la vue des pages (PL6, critères 13 et 16) : copie, en lecture seule, des blocs affichés
// sur une feuille et de ses marges, placés comme sur la feuille. Seuls les blocs qui touchent la feuille sont copiés,
// pour qu'une miniature reste légère même dans un document de 100 pages.
// INVARIANT : la copie est faite à partir de l'affichage, jamais du document : rien n'est modifié ni enregistré.
import type { Sheet } from "../core/sheets";

/** Attributs retirés de la copie : rien n'y est modifiable, sélectionnable ni annoncé deux fois. */
const REMOVED_ATTRIBUTES = ["id", "contenteditable", "tabindex", "role", "aria-label"];

/** Copie un élément affiché, sans ses attributs de saisie. */
function inertCopy(element: Element): HTMLElement {
  const copy = element.cloneNode(true) as HTMLElement;
  for (const node of [copy, ...Array.from(copy.querySelectorAll("*"))]) {
    for (const name of REMOVED_ATTRIBUTES) node.removeAttribute(name);
  }
  return copy;
}

/** Copie un élément à sa place, en pixels depuis le haut et la gauche de la feuille. */
function placedCopy(element: Element, origin: { left: number; top: number }): HTMLElement {
  const box = element.getBoundingClientRect();
  const copy = inertCopy(element);
  copy.style.position = "absolute";
  copy.style.margin = "0";
  copy.style.left = `${String(box.left - origin.left)}px`;
  copy.style.top = `${String(box.top - origin.top)}px`;
  copy.style.width = `${String(box.width)}px`;
  return copy;
}

/**
 * Construit le contenu d'une miniature, à la taille réelle de la feuille (l'appelant la réduit).
 * @param pile pile des feuilles (`.nano-page`)
 * @param editorElement éditeur affiché (`.nano-editor`)
 * @param sheet feuille à copier
 * @returns un élément de la taille de la feuille, ou null si l'affichage n'est pas prêt
 */
export function buildPageThumbnail(
  pile: HTMLElement,
  editorElement: HTMLElement,
  sheet: Sheet,
): HTMLElement | null {
  const pileBox = pile.getBoundingClientRect();
  const origin = { left: pileBox.left, top: pileBox.top + sheet.top };
  const bottom = origin.top + sheet.height;
  const root = document.createElement("div");
  root.className = "nano-thumbnail-sheet";
  // Format et marges du document (variables de la pile), pour placer l'en-tête et le pied de page.
  root.style.cssText = pile.style.cssText;
  root.style.width = `${String(pileBox.width)}px`;
  root.style.height = `${String(sheet.height)}px`;
  // Les styles du document s'appliquent aux blocs copiés, comme dans l'éditeur.
  const content = document.createElement("div");
  content.className = "nano-editor nano-thumbnail-content";
  root.append(content);
  for (const child of Array.from(editorElement.children)) {
    if (child.classList.contains("nano-sheet-gap")) continue;
    const box = child.getBoundingClientRect();
    if (box.bottom <= origin.top || box.top >= bottom || box.height === 0) continue;
    content.append(placedCopy(child, origin));
  }
  const margins = pile.querySelector(`.nano-sheet-margins[data-page="${String(sheet.page)}"]`);
  if (margins) {
    const copy = inertCopy(margins);
    copy.style.top = "0";
    root.append(copy);
  }
  return root;
}
