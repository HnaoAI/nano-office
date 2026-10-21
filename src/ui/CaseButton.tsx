// Bouton « Majuscules et minuscules » (« Aa ») de la barre de mise en forme et son petit menu (T2.4),
// au style des grilles de couleur (T1.7).
import type { Editor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { CASE_MODES } from "../core/textCase";
import { focusEditor } from "../editor/focus";
import { changeCase } from "../editor/textCase";
import { gridMove, usePopover } from "./usePopover";

/**
 * Bouton et menu des quatre conversions. Le menu prend le focus à l'ouverture, se parcourt aux
 * flèches, et se ferme après un choix, avec Échap ou par un clic à côté. Le bouton est grisé sans
 * sélection, puisque la conversion n'aurait aucun effet (critère 2).
 * INVARIANT : le nom accessible du bouton est « Majuscules et minuscules » (critère 1).
 * @param editor éditeur à piloter
 * @param hasSelection vrai si du texte est sélectionné
 */
export function CaseButton({ editor, hasSelection }: { editor: Editor; hasSelection: boolean }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popover = usePopover(rootRef, buttonRef);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (popover.open) items.current[0]?.focus();
  }, [popover.open]);

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const next = gridMove(event.key, index, CASE_MODES.length, 1);
    if (next === null) return;
    event.preventDefault();
    items.current[next]?.focus();
  };

  return (
    <div className="nano-popover-anchor" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="nano-popover-button nano-case-button"
        aria-label="Majuscules et minuscules"
        aria-haspopup="true"
        aria-expanded={popover.open}
        title="Majuscules et minuscules"
        disabled={!hasSelection}
        onMouseDown={(event) => event.preventDefault()}
        onClick={popover.toggle}
      >
        Aa
      </button>
      {popover.open && (
        <div className="nano-popover nano-menu" role="group" aria-label="Changer la casse">
          {CASE_MODES.map(({ mode, label }, index) => (
            <button
              key={mode}
              ref={(element) => {
                items.current[index] = element;
              }}
              type="button"
              className="nano-menu-item"
              tabIndex={index === 0 ? 0 : -1}
              onMouseDown={(event) => event.preventDefault()}
              onKeyDown={(event) => onKeyDown(event, index)}
              onClick={() => {
                popover.close();
                focusEditor(editor);
                changeCase(editor, mode);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
