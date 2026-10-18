// Barre d'outils de l'éditeur (T0b) : Gras, Italique, Annuler, Rétablir.
// Lit l'état de l'éditeur avec useEditorState pour mettre à jour les boutons à chaque modification.
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";

/** Nom de la touche de commande affiché dans les infobulles. */
const MOD =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "Cmd" : "Ctrl";

/**
 * Barre d'outils simple. Les boutons Gras et Italique indiquent leur état avec `aria-pressed`.
 * @param editor éditeur Tiptap à piloter
 */
export function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });

  return (
    <div className="nano-toolbar" role="toolbar" aria-label="Mise en forme">
      <button
        type="button"
        aria-pressed={state.bold}
        title={`Gras (${MOD}+B)`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>Gras</strong>
      </button>
      <button
        type="button"
        aria-pressed={state.italic}
        title={`Italique (${MOD}+I)`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>Italique</em>
      </button>
      <button
        type="button"
        disabled={!state.canUndo}
        title={`Annuler (${MOD}+Z)`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        Annuler
      </button>
      <button
        type="button"
        disabled={!state.canRedo}
        title={`Rétablir (${MOD}+Shift+Z)`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        Rétablir
      </button>
    </div>
  );
}
