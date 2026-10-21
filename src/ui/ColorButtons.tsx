// Boutons « Couleur du texte » et « Surlignage » de la barre de mise en forme (T1.7), chacun avec sa
// grille de pastilles. Les seules couleurs de l'interface sont celles du document : le trait sous
// le « A » et les pastilles (charte, « Couleurs du document »).
import type { Editor } from "@tiptap/react";
import { useEffect, useRef, type ReactNode } from "react";
import {
  HIGHLIGHT_COLORS,
  sameColor,
  TEXT_COLORS,
  type PaletteColor,
} from "../core/documentColors";
import { focusEditor } from "../editor/focus";
import { setHighlight, setTextColor, type ColorAtCursor } from "../editor/textColor";
import { HighlighterIcon } from "./icons";
import { gridMove, usePopover } from "./usePopover";

/**
 * Un bouton et sa grille de pastilles. La grille prend le focus à l'ouverture (sur la pastille
 * choisie), se parcourt aux flèches, et se ferme après un choix, avec Échap ou par un clic à côté
 * (critère 2). Chaque pastille montre son nom au survol (`title`).
 * @param label nom accessible du bouton
 * @param gridLabel nom accessible de la grille
 * @param noneClass classe de la pastille sans couleur (Automatique ou Aucun)
 * @param current couleur sous le curseur ; aucune pastille n'est choisie si elle est mélangée
 * @param onPick applique une couleur, ou null pour retirer la mise en forme
 */
function ColorPicker({
  label,
  gridLabel,
  icon,
  palette,
  noneClass,
  current,
  onPick,
}: {
  label: string;
  gridLabel: string;
  icon: ReactNode;
  palette: readonly PaletteColor[];
  noneClass: string;
  current: ColorAtCursor;
  onPick: (color: string | null) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popover = usePopover(rootRef, buttonRef);
  const swatches = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = current.mixed
    ? -1
    : palette.findIndex((color) => sameColor(color.value, current.value));
  const focusIndex = Math.max(selected, 0);

  useEffect(() => {
    if (popover.open) swatches.current[focusIndex]?.focus();
    // La pastille ne prend le focus qu'à l'ouverture, pas à chaque changement de couleur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popover.open]);

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const next = gridMove(event.key, index, palette.length, palette.length);
    if (next === null) return;
    event.preventDefault();
    swatches.current[next]?.focus();
  };

  return (
    <div className="nano-popover-anchor" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="nano-popover-button"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={popover.open}
        title={label}
        onMouseDown={(event) => event.preventDefault()}
        onClick={popover.toggle}
      >
        {icon}
      </button>
      {popover.open && (
        <div className="nano-popover nano-swatches" role="group" aria-label={gridLabel}>
          {palette.map((color, index) => (
            <button
              key={color.name}
              ref={(element) => {
                swatches.current[index] = element;
              }}
              type="button"
              className={color.value === null ? `nano-swatch ${noneClass}` : "nano-swatch"}
              style={color.value === null ? undefined : { background: color.value }}
              aria-label={color.name}
              aria-pressed={index === selected}
              title={color.name}
              tabIndex={index === focusIndex ? 0 : -1}
              onMouseDown={(event) => event.preventDefault()}
              onKeyDown={(event) => onKeyDown(event, index)}
              onClick={() => {
                popover.close();
                onPick(color.value);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Les deux boutons de couleur.
 * INVARIANT : les noms accessibles sont « Couleur du texte » et « Surlignage » (critère 1).
 * @param editor éditeur à piloter
 * @param textColor couleur du texte sous le curseur : le trait sous le « A » la montre, ou reste
 *   neutre si la sélection en mélange plusieurs (critère 6)
 * @param highlight surlignage sous le curseur, pour la pastille choisie
 */
export function ColorButtons({
  editor,
  textColor,
  highlight,
}: {
  editor: Editor;
  textColor: ColorAtCursor;
  highlight: ColorAtCursor;
}) {
  const barColor = textColor.mixed ? null : (textColor.value ?? "auto");
  return (
    <>
      <ColorPicker
        label="Couleur du texte"
        gridLabel="Couleurs du texte"
        icon={
          <span className="nano-color-icon" aria-hidden="true">
            A
            <span
              className={`nano-color-bar${barColor === null ? " nano-color-bar-mixed" : ""}${barColor === "auto" ? " nano-color-bar-auto" : ""}`}
              data-color={barColor ?? "mixed"}
              style={
                barColor === null || barColor === "auto" ? undefined : { background: barColor }
              }
            />
          </span>
        }
        palette={TEXT_COLORS}
        noneClass="nano-swatch-auto"
        current={textColor}
        onPick={(color) => {
          focusEditor(editor);
          setTextColor(editor, color);
        }}
      />
      <ColorPicker
        label="Surlignage"
        gridLabel="Couleurs de surlignage"
        icon={<HighlighterIcon />}
        palette={HIGHLIGHT_COLORS}
        noneClass="nano-swatch-none"
        current={highlight}
        onPick={(color) => {
          focusEditor(editor);
          setHighlight(editor, color);
        }}
      />
    </>
  );
}
