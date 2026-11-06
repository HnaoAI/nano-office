// Vue des pages (PL6, critères 12 à 16) : toutes les feuilles en miniatures, sur un écran qui remplit la fenêtre, pour
// voir le document d'un coup d'œil et aller à une page. Un clic ou Entrée y va, les flèches passent d'une miniature à
// l'autre, Échap ou « Fermer » ferme sans bouger. Seules les miniatures visibles sont dessinées (pageThumbnail.ts).
// En lecture seule : rien n'est modifié, imprimé ni enregistré.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Sheet } from "../core/sheets";
import { CloseIcon } from "./icons";
import { buildPageThumbnail } from "./pageThumbnail";

/** Largeur d'une miniature, en pixels (critère 13). */
export const THUMBNAIL_WIDTH = 160;

/** Une miniature : dessinée seulement quand elle entre dans la fenêtre (critère 16). */
function Thumbnail({
  sheet,
  scale,
  pile,
  editorElement,
  root,
}: {
  sheet: Sheet;
  scale: number;
  pile: HTMLElement;
  editorElement: HTMLElement;
  root: HTMLElement | null;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { root, rootMargin: "200px 0px" },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [root, visible]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !visible) return;
    const content = buildPageThumbnail(pile, editorElement, sheet);
    if (!content) return;
    content.style.transform = `scale(${String(scale)})`;
    frame.replaceChildren(content);
    return () => frame.replaceChildren();
  }, [visible, pile, editorElement, sheet, scale]);

  return (
    <div
      ref={frameRef}
      className="nano-thumbnail-frame"
      data-drawn={visible ? "true" : undefined}
      style={{ height: `${String(sheet.height * scale)}px` }}
      inert
    />
  );
}

/**
 * Écran « Vue des pages ».
 * @param sheets feuilles du document (`usePageLayout`)
 * @param current page où se trouve le curseur, entourée d'un cadre noir (critère 13)
 * @param pile pile des feuilles affichée (`.nano-page`)
 * @param editorElement éditeur affiché (`.nano-editor`)
 * @param onGo ferme la vue et amène en haut de la page choisie (critère 14)
 * @param onClose ferme la vue sans bouger (critère 14)
 */
export function PageThumbnails({
  sheets,
  current,
  pile,
  editorElement,
  onGo,
  onClose,
}: {
  sheets: readonly Sheet[];
  current: number;
  pile: HTMLElement;
  editorElement: HTMLElement;
  onGo: (page: number) => void;
  onClose: () => void;
}) {
  const [grid, setGrid] = useState<HTMLElement | null>(null);
  const [focused, setFocused] = useState(current);
  const scale = THUMBNAIL_WIDTH / Math.max(pile.getBoundingClientRect().width, 1);

  // La page du curseur prend le focus à l'ouverture, pour aller ailleurs au clavier (critère 15).
  useEffect(() => {
    grid?.querySelector<HTMLButtonElement>(`[data-page="${String(current)}"]`)?.focus();
  }, [grid, current]);

  /** Nombre de miniatures par ligne de la grille, lu à l'écran. */
  const columns = () => {
    const buttons = Array.from(grid?.querySelectorAll<HTMLElement>(".nano-thumbnail") ?? []);
    const top = buttons[0]?.offsetTop;
    return Math.max(1, buttons.filter((button) => button.offsetTop === top).length);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    const steps: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: columns(),
      ArrowUp: -columns(),
      Home: -sheets.length,
      End: sheets.length,
    };
    const step = steps[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = Math.min(Math.max(focused + step, 1), sheets.length);
    setFocused(next);
    grid?.querySelector<HTMLButtonElement>(`[data-page="${String(next)}"]`)?.focus();
  };

  return (
    <div
      className="nano-thumbnails"
      role="dialog"
      aria-modal="true"
      aria-label="Vue des pages"
      onKeyDown={onKeyDown}
    >
      <div className="nano-thumbnails-head">
        <h2>Vue des pages</h2>
        <span className="nano-thumbnails-count">
          {sheets.length === 1 ? "1 page" : `${String(sheets.length)} pages`}
        </span>
        <button type="button" className="nano-thumbnails-close" onClick={onClose}>
          <CloseIcon />
          Fermer
        </button>
      </div>
      <div className="nano-thumbnails-grid" ref={setGrid}>
        {sheets.map((sheet) => (
          <button
            key={sheet.page}
            type="button"
            className="nano-thumbnail"
            data-page={sheet.page}
            aria-current={sheet.page === current ? "page" : undefined}
            aria-label={`Page ${String(sheet.page)}`}
            tabIndex={sheet.page === focused ? 0 : -1}
            onFocus={() => setFocused(sheet.page)}
            onClick={() => onGo(sheet.page)}
          >
            <Thumbnail
              sheet={sheet}
              scale={scale}
              pile={pile}
              editorElement={editorElement}
              root={grid}
            />
            <span className="nano-thumbnail-number" aria-hidden="true">
              {sheet.page}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
