// Bouton « Majuscules et minuscules » (« Aa ») de la barre de mise en forme et son petit menu (T2.4),
// au style des grilles de couleur (T1.7), avec « Exposant » et « Indice » sous les quatre choix (T2.13).
import type { Editor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { CASE_MODES } from "../core/textCase";
import { focusEditor } from "../editor/focus";
import { changeCase } from "../editor/textCase";
import { MOD } from "./shortcuts";
import { gridMove, usePopover } from "./usePopover";

/** Position du texte sous le curseur (T2.13) : exposant, indice, ou ligne normale (null). */
export type TextScript = "superscript" | "subscript" | null;

/** Exposant et indice du menu (T2.13, critère 1), avec leur raccourci. */
const SCRIPTS = [
  { mark: "superscript", label: "Exposant", key: "." },
  { mark: "subscript", label: "Indice", key: "," },
] as const;

/**
 * Bouton et menu des quatre conversions, puis d'« Exposant » et « Indice ». Le menu prend le focus à
 * l'ouverture, se parcourt aux flèches, et se ferme après un choix, avec Échap ou par un clic à côté. Le
 * bouton est grisé sans sélection, puisque la conversion n'aurait aucun effet (T2.4, critère 2) ; sans
 * sélection, l'exposant et l'indice restent accessibles au clavier (Ctrl/Cmd+. et Ctrl/Cmd+,).
 * Exposant et indice sont des cases à cocher (`menuitemcheckbox`) qui montrent l'état du texte sous le
 * curseur (T2.13, critère 3) ; elles sont dans leur propre groupe, sous un séparateur.
 * INVARIANT : le nom accessible du bouton est « Majuscules et minuscules » (T2.4, critère 1).
 * @param editor éditeur à piloter
 * @param hasSelection vrai si du texte est sélectionné
 * @param script exposant ou indice du texte sous le curseur
 */
export function CaseButton({
  editor,
  hasSelection,
  script,
}: {
  editor: Editor;
  hasSelection: boolean;
  script: TextScript;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popover = usePopover(rootRef, buttonRef);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const count = CASE_MODES.length + SCRIPTS.length;

  useEffect(() => {
    if (popover.open) items.current[0]?.focus();
  }, [popover.open]);

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const next = gridMove(event.key, index, count, 1);
    if (next === null) return;
    event.preventDefault();
    items.current[next]?.focus();
  };

  const itemProps = (index: number) => ({
    ref: (element: HTMLButtonElement | null) => {
      items.current[index] = element;
    },
    type: "button" as const,
    className: "nano-menu-item",
    tabIndex: index === 0 ? 0 : -1,
    onMouseDown: (event: React.MouseEvent) => event.preventDefault(),
    onKeyDown: (event: React.KeyboardEvent) => onKeyDown(event, index),
  });

  return (
    <div className="nano-popover-anchor" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="nano-popover-button nano-case-button"
        aria-label="Majuscules et minuscules"
        aria-haspopup="true"
        aria-expanded={popover.open}
        title="Majuscules et minuscules, exposant et indice"
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
              {...itemProps(index)}
              onClick={() => {
                popover.close();
                focusEditor(editor);
                changeCase(editor, mode);
              }}
            >
              {label}
            </button>
          ))}
          <div className="nano-menu-separator" aria-hidden="true" />
          <div role="group" aria-label="Exposant et indice" className="nano-menu">
            {SCRIPTS.map(({ mark, label, key }, offset) => (
              <button
                key={mark}
                {...itemProps(CASE_MODES.length + offset)}
                role="menuitemcheckbox"
                aria-checked={script === mark}
                title={`${label} (${MOD}+${key})`}
                onClick={() => {
                  popover.close();
                  focusEditor(editor);
                  if (mark === "superscript") editor.commands.toggleSuperscript();
                  else editor.commands.toggleSubscript();
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
