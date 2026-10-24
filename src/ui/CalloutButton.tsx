// Bouton « Encadré » de la barre de mise en forme (T2.19) et son petit menu, au style du menu « Aa » (T2.4) :
// les trois styles d'encadré et, dans un encadré, « Retirer l'encadré ». La logique est dans src/editor/callout.ts.
import type { Editor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { CALLOUT_STYLES, type CalloutStyle } from "../core/calloutSchema";
import { removeCallout, setCallout } from "../editor/callout";
import { focusEditor } from "../editor/focus";
import { CalloutIcon } from "./icons";
import { gridMove, usePopover } from "./usePopover";

/**
 * Bouton et menu de l'encadré. Hors d'un encadré, choisir un style encadre les paragraphes sélectionnés ; dans un
 * encadré, le bouton est activé, le style courant est coché, et « Retirer l'encadré » rend les paragraphes tels
 * quels (critère 1). Grisé quand la sélection ne peut pas être encadrée (tableau, saut de page).
 * @param editor éditeur à piloter
 * @param current style de l'encadré du curseur, ou null hors d'un encadré
 * @param canWrap vrai si la sélection peut être encadrée
 */
export function CalloutButton({
  editor,
  current,
  canWrap,
}: {
  editor: Editor;
  current: CalloutStyle | null;
  canWrap: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popover = usePopover(rootRef, buttonRef);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const count = CALLOUT_STYLES.length + (current ? 1 : 0);

  useEffect(() => {
    if (popover.open) items.current[0]?.focus();
  }, [popover.open]);

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const next = gridMove(event.key, index, count, 1);
    if (next === null) return;
    event.preventDefault();
    items.current[next]?.focus();
  };

  const choose = (action: () => void) => {
    popover.close();
    focusEditor(editor);
    action();
  };

  return (
    <div className="nano-popover-anchor" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="nano-popover-button nano-block-button"
        aria-label="Encadré"
        aria-haspopup="true"
        aria-expanded={popover.open}
        aria-pressed={current !== null}
        title="Encadré : encadrer les paragraphes sélectionnés"
        disabled={current === null && !canWrap}
        onMouseDown={(event) => event.preventDefault()}
        onClick={popover.toggle}
      >
        <CalloutIcon />
      </button>
      {popover.open && (
        <div className="nano-popover nano-menu" role="group" aria-label="Style de l'encadré">
          {CALLOUT_STYLES.map(({ value, label }, index) => (
            <button
              key={value}
              ref={(element) => {
                items.current[index] = element;
              }}
              type="button"
              className="nano-menu-item"
              tabIndex={index === 0 ? 0 : -1}
              onMouseDown={(event) => event.preventDefault()}
              onKeyDown={(event) => onKeyDown(event, index)}
              role="menuitemradio"
              aria-checked={current === value}
              onClick={() => choose(() => setCallout(editor, value))}
            >
              <span
                className={`nano-callout-swatch nano-callout-swatch-${value}`}
                aria-hidden="true"
              />
              {label}
            </button>
          ))}
          {current && (
            <>
              <div className="nano-menu-separator" aria-hidden="true" />
              <button
                ref={(element) => {
                  items.current[CALLOUT_STYLES.length] = element;
                }}
                type="button"
                className="nano-menu-item"
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onKeyDown={(event) => onKeyDown(event, CALLOUT_STYLES.length)}
                onClick={() => choose(() => removeCallout(editor))}
              >
                Retirer l'encadré
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
