// Liste déroulante « Interligne » de la barre de mise en forme (T2.2), au style des listes de police
// et de taille.
import type { Editor } from "@tiptap/react";
import { LINE_HEIGHTS } from "../core/lineHeight";
import { focusEditor } from "../editor/focus";
import { setLineHeight } from "../editor/lineHeight";

const DEFAULT = "default";

/**
 * Liste « Interligne » : Par défaut, 1, 1,15, 1,5, 2 (critère 1).
 * @param editor éditeur à piloter
 * @param value interligne des blocs sélectionnés, `"default"` sans attribut, ou null s'ils en
 *   mélangent plusieurs : la liste reste alors vide (critère 5), comme pour un interligne inconnu.
 */
export function LineHeightSelect({ editor, value }: { editor: Editor; value: string | null }) {
  const known =
    value === DEFAULT || LINE_HEIGHTS.some((entry) => entry.value === value) ? value : null;
  return (
    <select
      className="nano-select nano-line-height-select"
      aria-label="Interligne"
      title="Interligne"
      value={known ?? ""}
      onChange={(event) => {
        const choice = LINE_HEIGHTS.find((entry) => entry.value === event.target.value);
        focusEditor(editor);
        setLineHeight(editor, choice?.value ?? null);
      }}
    >
      {known === null && <option value="" disabled hidden />}
      <option value={DEFAULT}>Par défaut</option>
      {LINE_HEIGHTS.map(({ value: entry, label }) => (
        <option key={entry} value={entry}>
          {label}
        </option>
      ))}
    </select>
  );
}
