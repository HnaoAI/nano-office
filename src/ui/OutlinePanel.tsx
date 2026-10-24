// Panneau « Plan » à gauche de la page (T2.9) : titres en retrait selon leur niveau, sauts de page,
// numéros de page, titre actif, clic pour aller à un titre, glisser-déposer d'une partie avec un trait
// de dépôt, et Alt+Shift+Flèche au clavier. Les actions sur le document sont dans src/editor/outline.ts.
// Il n'est pas dans le document : il ne s'imprime pas (print.css), n'est ni exporté ni enregistré (critère 8).
import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { entryKey, type OutlineEntry } from "../core/outline";
import { isMacPlatform } from "../editor/platform";
import {
  canDropSection,
  goToHeading,
  moveSectionBefore,
  moveSectionStep,
  type DropBefore,
} from "../editor/outline";
import { CloseIcon } from "./icons";
import { sectionMoveDirection, type OutlineState } from "./useOutline";

/**
 * Largeur sous laquelle le panneau passe par-dessus la page et se ferme après un clic (critère 1).
 * INVARIANT : même valeur que la règle `@media` de outline.css.
 */
const OVERLAY_QUERY = "(max-width: 1139px)";

/** Type des données glissées, propre au plan : l'éditeur n'y trouve aucun texte à coller. */
const DRAG_TYPE = "application/x-nano-outline";

/** Texte d'un titre sans texte, pour qu'il reste visible et cliquable dans le plan. */
const EMPTY_HEADING = "Titre sans texte";

/** Phrase affichée dans un document sans titre (critère 2). */
export const NO_HEADING_TEXT =
  "Aucun titre pour l'instant : choisissez « Titre 1 », « Titre 2 » ou « Titre 3 » dans la liste « Texte normal » de la barre pour en créer un.";

/** Où le trait de dépôt est affiché : avant la ligne de cette clé, ou à la fin (`end`). */
type DropMark = string | "end" | null;

/**
 * Panneau du plan.
 * @param editor éditeur du document affiché
 * @param outline lignes, titre actif et numéros de page (`useOutline`)
 * @param coveredTop hauteur cachée par la partie figée, pour arrêter le titre atteint dessous (M1)
 * @param onClose ferme le panneau (bouton, Échap, clic à petite largeur)
 */
export function OutlinePanel({
  editor,
  outline,
  coveredTop,
  onClose,
}: {
  editor: Editor;
  outline: OutlineState;
  coveredTop: () => number;
  onClose: () => void;
}) {
  const { entries, active, pages } = outline;
  const list = useRef<HTMLOListElement>(null);
  const [dragged, setDragged] = useState<OutlineEntry | null>(null);
  const [drop, setDrop] = useState<DropMark>(null);
  // Ligne à garder sous le focus après un déplacement au clavier : React la recrée ailleurs dans la liste.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const alt = isMacPlatform() ? "Option" : "Alt";

  useEffect(() => {
    if (focusKey === null) return;
    const target = list.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`);
    target?.focus();
  }, [entries, focusKey]);

  function go(entry: OutlineEntry) {
    goToHeading(editor, entry, coveredTop);
    if (window.matchMedia(OVERLAY_QUERY).matches) onClose();
  }

  /** Ligne avant laquelle poser la partie, d'après la moitié de la ligne survolée. */
  function dropBefore(index: number, lowerHalf: boolean): DropBefore {
    const entry = entries[lowerHalf ? index + 1 : index];
    return entry ?? null;
  }

  function onDragOver(event: React.DragEvent, index: number) {
    if (!dragged) return;
    const box = event.currentTarget.getBoundingClientRect();
    const before = dropBefore(index, event.clientY > box.top + box.height / 2);
    if (!canDropSection(editor, dragged, before)) {
      setDrop(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDrop(before ? entryKey(before) : "end");
  }

  function onDrop(event: React.DragEvent, index: number) {
    if (!dragged) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const before = dropBefore(index, event.clientY > box.top + box.height / 2);
    moveSectionBefore(editor, dragged, before);
    setDragged(null);
    setDrop(null);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, entry: OutlineEntry) {
    const direction = sectionMoveDirection(event);
    if (direction) {
      event.preventDefault();
      setFocusKey(entryKey(entry));
      moveSectionStep(editor, entry, direction);
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    // Flèches : titre précédent ou suivant du plan.
    event.preventDefault();
    const buttons = [...(list.current?.querySelectorAll<HTMLElement>("button[data-key]") ?? [])];
    const index = buttons.indexOf(event.currentTarget);
    buttons[event.key === "ArrowUp" ? index - 1 : index + 1]?.focus();
  }

  return (
    <aside
      className="nano-outline"
      aria-labelledby="nano-outline-title"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        onClose();
        editor.commands.focus();
      }}
    >
      <div className="nano-outline-header">
        <h2 id="nano-outline-title">Plan</h2>
        <button
          type="button"
          className="nano-outline-close"
          aria-label="Fermer le plan"
          title="Fermer le plan"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      {entries.some((entry) => entry.kind === "heading") ? (
        <ol
          ref={list}
          className="nano-outline-list"
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrop(null);
          }}
        >
          {entries.map((entry, index) => {
            const key = entryKey(entry);
            const page = pages.get(key);
            const className =
              drop === key ? "nano-outline-item nano-outline-drop" : "nano-outline-item";
            return (
              <li
                key={key}
                className={className}
                data-level={entry.kind === "heading" ? entry.level : undefined}
                onDragOver={(event) => onDragOver(event, index)}
                onDrop={(event) => onDrop(event, index)}
              >
                {entry.kind === "heading" ? (
                  <button
                    type="button"
                    data-key={key}
                    draggable
                    aria-current={active === key ? "true" : undefined}
                    title={`Faire glisser pour déplacer la partie (${alt}+Shift+↑ ou ↓ au clavier)`}
                    onClick={() => go(entry)}
                    onKeyDown={(event) => onKeyDown(event, entry)}
                    onBlur={() => setFocusKey(null)}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(DRAG_TYPE, key);
                      setDragged(entry);
                    }}
                    onDragEnd={() => {
                      setDragged(null);
                      setDrop(null);
                    }}
                  >
                    <span
                      className={
                        entry.text ? "nano-outline-text" : "nano-outline-text nano-outline-empty"
                      }
                    >
                      {entry.text || EMPTY_HEADING}
                    </span>
                    {page !== undefined && <span className="nano-outline-page">{page}</span>}
                  </button>
                ) : (
                  <span className="nano-outline-break">
                    <span className="nano-outline-text">Saut de page</span>
                    {page !== undefined && <span className="nano-outline-page">{page}</span>}
                  </span>
                )}
              </li>
            );
          })}
          <li
            className={drop === "end" ? "nano-outline-end nano-outline-drop" : "nano-outline-end"}
            aria-hidden="true"
            onDragOver={(event) => onDragOver(event, entries.length)}
            onDrop={(event) => onDrop(event, entries.length)}
          />
        </ol>
      ) : (
        <p className="nano-outline-none">{NO_HEADING_TEXT}</p>
      )}
    </aside>
  );
}
