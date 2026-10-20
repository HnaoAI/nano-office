// Liste déroulante « Style du paragraphe » de la barre de mise en forme (T1.1) : texte normal ou
// titre 1 à 3, au style des listes déroulantes de la maquette (docs/design/maquette/Main.dc.html).
import type { Editor } from "@tiptap/react";
import { focusEditor } from "../editor/focus";
import type { BlockStyleLevel } from "../core/schema";
import { setBlockStyle } from "../editor/blockStyle";
import { HEADING_MOD } from "./shortcuts";

/** Choix proposés, dans l'ordre du ticket T1.1 (critère 1). */
const STYLES: { level: BlockStyleLevel; label: string }[] = [
  { level: 0, label: "Texte normal" },
  { level: 1, label: "Titre 1" },
  { level: 2, label: "Titre 2" },
  { level: 3, label: "Titre 3" },
];

/**
 * Liste déroulante du style du paragraphe.
 * @param editor éditeur à piloter
 * @param value style des blocs sélectionnés, ou null s'ils en mélangent plusieurs (liste vide)
 */
export function ParagraphStyleSelect({
  editor,
  value,
}: {
  editor: Editor;
  value: BlockStyleLevel | null;
}) {
  return (
    <select
      className="nano-select"
      aria-label="Style du paragraphe"
      title={`Style du paragraphe (${HEADING_MOD}+1, 2, 3 ; ${HEADING_MOD}+0 pour le texte normal)`}
      value={value === null ? "" : String(value)}
      onChange={(event) => {
        const level = Number(event.target.value) as BlockStyleLevel;
        focusEditor(editor);
        setBlockStyle(level)(editor.state, editor.view.dispatch);
      }}
    >
      {value === null && <option value="" disabled hidden />}
      {STYLES.map(({ level, label }) => (
        <option key={level} value={String(level)}>
          {label}
        </option>
      ))}
    </select>
  );
}
