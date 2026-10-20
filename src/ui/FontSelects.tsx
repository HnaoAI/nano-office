// Listes déroulantes « Police » et « Taille » de la barre de mise en forme (T1.4), au style de la
// maquette. Chaque police s'affiche dans sa propre police (critère 1).
import type { Editor } from "@tiptap/react";
import { DOCUMENT_FONTS, FONT_SIZES } from "../core/textStyle";
import { focusEditor } from "../editor/focus";
import { setFontFamily, setFontSize } from "../editor/fontStyle";

/**
 * Les deux listes déroulantes.
 * @param editor éditeur à piloter
 * @param font police au curseur, ou null si la sélection en mélange (liste vide). Une police inconnue
 *   de l'application laisse aussi la liste vide.
 * @param size taille en points au curseur, ou null (sélection mélangée, titre sans taille choisie)
 */
export function FontSelects({
  editor,
  font,
  size,
}: {
  editor: Editor;
  font: string | null;
  size: number | null;
}) {
  const knownFont = DOCUMENT_FONTS.some((entry) => entry.name === font) ? font : null;
  const knownSize = FONT_SIZES.some((entry) => entry === size) ? size : null;
  return (
    <>
      <select
        className="nano-select"
        aria-label="Police"
        title="Police"
        value={knownFont ?? ""}
        onChange={(event) => {
          focusEditor(editor);
          setFontFamily(editor, event.target.value);
        }}
      >
        {knownFont === null && <option value="" disabled hidden />}
        {DOCUMENT_FONTS.map(({ name, stack }) => (
          <option key={name} value={name} style={{ fontFamily: stack }}>
            {name}
          </option>
        ))}
      </select>
      <select
        className="nano-select nano-size-select"
        aria-label="Taille"
        title="Taille, en points"
        value={knownSize === null ? "" : String(knownSize)}
        onChange={(event) => {
          focusEditor(editor);
          setFontSize(editor, Number(event.target.value));
        }}
      >
        {knownSize === null && <option value="" disabled hidden />}
        {FONT_SIZES.map((points) => (
          <option key={points} value={String(points)}>
            {points}
          </option>
        ))}
      </select>
    </>
  );
}
