// Boutons « Diminuer le retrait » et « Augmenter le retrait » de la barre de mise en forme (T2.14), après les
// boutons de liste. La logique est dans src/editor/indent.ts.
import type { Editor } from "@tiptap/react";
import { changeIndent } from "../editor/indent";
import { focusEditor } from "../editor/focus";
import { IndentDecreaseIcon, IndentIncreaseIcon } from "./icons";

/**
 * Les deux boutons du retrait, grisés quand ils n'auraient aucun effet (niveau 0 ou 5, hors d'une liste).
 * @param editor éditeur à piloter
 * @param available actions possibles au curseur (`indentAvailability`)
 */
export function IndentButtons({
  editor,
  available,
}: {
  editor: Editor;
  available: { increase: boolean; decrease: boolean };
}) {
  const buttons = [
    {
      delta: -1,
      label: "Diminuer le retrait",
      icon: <IndentDecreaseIcon />,
      enabled: available.decrease,
    },
    {
      delta: 1,
      label: "Augmenter le retrait",
      icon: <IndentIncreaseIcon />,
      enabled: available.increase,
    },
  ] as const;
  return buttons.map(({ delta, label, icon, enabled }) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      title={label}
      disabled={!enabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        focusEditor(editor);
        changeIndent(editor, delta);
      }}
    >
      {icon}
    </button>
  ));
}
