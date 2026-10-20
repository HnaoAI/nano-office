// Boutons d'alignement de la barre de mise en forme (T1.3) : gauche, centré, droite, justifié, avec
// les icônes et les noms de la maquette. Celui du paragraphe courant est activé.
import type { Editor } from "@tiptap/react";
import { focusEditor } from "../editor/focus";
import type { TextAlignment } from "../core/schema";
import { setAlignment } from "../editor/alignment";
import { AlignCenterIcon, AlignJustifyIcon, AlignLeftIcon, AlignRightIcon } from "./icons";
import { MOD } from "./shortcuts";

const BUTTONS: { alignment: TextAlignment; label: string; key: string; icon: React.ReactNode }[] = [
  { alignment: "left", label: "Aligner à gauche", key: "L", icon: <AlignLeftIcon /> },
  { alignment: "center", label: "Centrer", key: "E", icon: <AlignCenterIcon /> },
  { alignment: "right", label: "Aligner à droite", key: "R", icon: <AlignRightIcon /> },
  { alignment: "justify", label: "Justifier", key: "J", icon: <AlignJustifyIcon /> },
];

/**
 * Les quatre boutons d'alignement.
 * @param editor éditeur à piloter
 * @param active alignement des blocs sélectionnés, ou null s'ils en mélangent plusieurs
 */
export function AlignmentButtons({
  editor,
  active,
}: {
  editor: Editor;
  active: TextAlignment | null;
}) {
  return BUTTONS.map(({ alignment, label, key, icon }) => (
    <button
      key={alignment}
      type="button"
      className="nano-block-button"
      aria-label={label}
      aria-pressed={active === alignment}
      title={`${label} (${MOD}+Shift+${key})`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        focusEditor(editor);
        setAlignment(editor, alignment);
      }}
    >
      {icon}
    </button>
  ));
}
