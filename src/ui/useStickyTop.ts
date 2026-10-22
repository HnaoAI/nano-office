// Partie figée en haut de la fenêtre (M1) : en-tête, message, barre de mise en forme et recherche
// restent visibles quand la page défile. Ce hook mesure la hauteur qu'ils cachent, pour que le
// curseur et les occurrences trouvées ne passent jamais dessous (critère B).
import { useCallback, useEffect, useRef } from "react";

/**
 * Variable CSS posée sur <html> : hauteur de la partie figée, lue par le `scroll-margin-top` de
 * l'occurrence trouvée (search.css) et de la correction choisie de l'assistant (assistant.css).
 */
const HEIGHT_VARIABLE = "--sticky-top-height";

/**
 * Partie réellement figée : tout le haut (`.nano-top`), ou seulement le message et la barre
 * (`.nano-top-tools`) dans une fenêtre très basse ou étroite (critère C). Null si rien n'est figé.
 */
function stuckPart(top: HTMLElement | null, tools: HTMLElement | null): HTMLElement | null {
  for (const part of [top, tools]) {
    if (!part) continue;
    // `display: contents` retire la boîte de `.nano-top` sans changer sa position calculée.
    const style = getComputedStyle(part);
    if (style.position === "sticky" && style.display !== "contents") return part;
  }
  return null;
}

/**
 * Mesure la partie figée et tient à jour `--sticky-top-height`.
 * @returns `topRef` pour `.nano-top`, `toolsRef` pour `.nano-top-tools`, et `coveredTop`, fonction
 *   stable qui donne la hauteur cachée en haut de la fenêtre, en pixels, au moment de l'appel
 */
export function useStickyTop() {
  const topRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);

  const coveredTop = useCallback(() => {
    const part = stuckPart(topRef.current, toolsRef.current);
    return part ? Math.max(0, part.getBoundingClientRect().bottom) : 0;
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const part = stuckPart(topRef.current, toolsRef.current);
      root.style.setProperty(HEIGHT_VARIABLE, `${String(part?.offsetHeight ?? 0)}px`);
    };
    update();
    // La hauteur change quand la barre passe sur deux lignes, qu'un message ou la recherche
    // s'ouvre ; la partie figée change quand la fenêtre passe sous 500 px de haut ou 600 px de large.
    const observer = new ResizeObserver(update);
    for (const part of [topRef.current, toolsRef.current]) if (part) observer.observe(part);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty(HEIGHT_VARIABLE);
    };
  }, []);

  return { topRef, toolsRef, coveredTop };
}
