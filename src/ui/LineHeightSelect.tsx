// Liste déroulante « Interligne » de la barre de mise en forme (T2.2), au style des listes de police
// et de taille, avec son icône devant le texte, dans le même fond (M1).
import type { Editor } from "@tiptap/react";
import { LINE_HEIGHTS } from "../core/lineHeight";
import { focusEditor } from "../editor/focus";
import { setLineHeight } from "../editor/lineHeight";
import { LineHeightIcon } from "./icons";

const DEFAULT = "default";

/**
 * Liste « Interligne » : Interligne normal, 1, 1,15, 1,5, 2 (T2.2, critère 1). « Interligne normal »
 * remplace « Par défaut » depuis M1 : seul le libellé change, la valeur `"default"` et les fichiers
 * restent les mêmes (M1, critère 2). INVARIANT : le nom accessible reste « Interligne » (M1, critère 3).
 * @param editor éditeur à piloter
 * @param value interligne des blocs sélectionnés, `"default"` sans attribut, ou null s'ils en
 *   mélangent plusieurs : la liste reste alors vide (critère 5), comme pour un interligne inconnu.
 */
export function LineHeightSelect({ editor, value }: { editor: Editor; value: string | null }) {
  const known =
    value === DEFAULT || LINE_HEIGHTS.some((entry) => entry.value === value) ? value : null;
  return (
    <span className="nano-select-with-icon">
      <LineHeightIcon />
      <select
        className="nano-select"
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
        <option value={DEFAULT}>Interligne normal</option>
        {LINE_HEIGHTS.map(({ value: entry, label }) => (
          <option key={entry} value={entry}>
            {label}
          </option>
        ))}
      </select>
    </span>
  );
}
