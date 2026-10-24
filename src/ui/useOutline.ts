// Plan du document affiché (T2.9) : lignes du plan relues après chaque modification, au plus une fois
// par image affichée et seulement si elles changent (critère 7), titre actif d'après le curseur
// (critère 3), numéro de page de chaque ligne d'après les repères de T2.8 (critère 2), et
// Alt+Shift+Flèche dans un titre du document quand le plan est ouvert (critère 4).
import type { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";
import {
  activeHeading,
  documentOutline,
  entryKey,
  sameOutline,
  type OutlineEntry,
} from "../core/outline";
import { pageAt, type PageLayout } from "../core/pageBreaks";
import { headingAtCursor, moveSectionStep } from "../editor/outline";

/** Plan à afficher. */
export interface OutlineState {
  entries: OutlineEntry[];
  /** Clé (`entryKey`) du titre de la partie où se trouve le curseur, ou null. */
  active: string | null;
  /** Numéro de page de chaque ligne, par clé ; absent tant qu'il n'est pas mesuré. */
  pages: ReadonlyMap<string, number>;
}

/** Touche de déplacement d'une partie : Alt+Shift+Flèche haut ou bas (Option+Shift sur Mac). */
export function sectionMoveDirection(
  event: KeyboardEvent | React.KeyboardEvent,
): "up" | "down" | null {
  if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return null;
  if (event.key === "ArrowUp") return "up";
  if (event.key === "ArrowDown") return "down";
  return null;
}

function samePages(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, page] of a) if (b.get(key) !== page) return false;
  return true;
}

/**
 * Suit le plan d'un éditeur.
 * INVARIANT : rien n'est écrit dans le document ; le plan est calculé à côté (critère 8).
 * @param editor éditeur affiché
 * @param open vrai quand le panneau est ouvert : les numéros de page et le raccourci ne servent qu'alors
 * @param layout coupures de page calculées par T2.8 (`usePageLayout`)
 */
export function useOutline(editor: Editor, open: boolean, layout: PageLayout): OutlineState {
  const [entries, setEntries] = useState<OutlineEntry[]>(() => documentOutline(editor.state.doc));
  const [active, setActive] = useState<string | null>(null);
  const [pages, setPages] = useState<ReadonlyMap<string, number>>(new Map());

  // Lignes et titre actif : relus au plus une fois par image, quel que soit le nombre de transactions.
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      if (editor.isDestroyed) return;
      const { doc, selection } = editor.state;
      const next = documentOutline(doc);
      setEntries((previous) => (sameOutline(previous, next) ? previous : next));
      setActive(activeHeading(doc, selection.from));
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(read);
    };
    schedule();
    editor.on("transaction", schedule);
    return () => {
      cancelAnimationFrame(frame);
      editor.off("transaction", schedule);
    };
  }, [editor, open]);

  // Numéros de page : position de chaque ligne dans la feuille, placée sur les repères de T2.8.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      if (editor.isDestroyed) return;
      const view = editor.view;
      const offsets: number[] = [];
      view.state.doc.forEach((_node, offset) => offsets.push(offset));
      const top = view.dom.getBoundingClientRect().top;
      const next = new Map<string, number>();
      for (const entry of entries) {
        const pos = offsets[entry.index];
        const element = pos === undefined ? null : view.nodeDOM(pos);
        if (!(element instanceof HTMLElement)) continue;
        next.set(entryKey(entry), pageAt(layout, element.getBoundingClientRect().top - top));
      }
      setPages((previous) => (samePages(previous, next) ? previous : next));
    });
    return () => cancelAnimationFrame(frame);
  }, [editor, open, entries, layout]);

  // Alt+Shift+Flèche dans un titre du document, plan ouvert : la partie entière se déplace (critère 4).
  useEffect(() => {
    if (!open) return;
    const dom = editor.view.dom;
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = sectionMoveDirection(event);
      const heading = direction ? headingAtCursor(editor) : null;
      if (!direction || !heading) return;
      event.preventDefault();
      event.stopPropagation();
      moveSectionStep(editor, heading, direction);
    };
    dom.addEventListener("keydown", onKeyDown, { capture: true });
    return () => dom.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [editor, open]);

  return { entries, active, pages };
}
