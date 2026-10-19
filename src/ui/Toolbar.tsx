// Barre de mise en forme flottante (T0b, style U1a) : Annuler, Rétablir, séparateur, Gras, Italique.
// Lit l'état de l'éditeur avec useEditorState pour mettre à jour les boutons à chaque modification.
// Les tickets T1 ajouteront leurs contrôles ici, au même style.
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { RedoIcon, UndoIcon } from "./icons";
import { MOD } from "./shortcuts";

/**
 * Barre de mise en forme. Gras et Italique indiquent leur état avec `aria-pressed`.
 * INVARIANT : les noms accessibles (« Annuler », « Rétablir », « Gras », « Italique ») ne changent pas,
 * même si le bouton n'affiche qu'une icône ou une lettre (U1a, critère 7).
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
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();

  return (
    <div className="nano-format-bar" role="toolbar" aria-label="Mise en forme">
      <button
        type="button"
        aria-label="Annuler"
        disabled={!state.canUndo}
        title={`Annuler (${MOD}+Z)`}
        onMouseDown={keepFocus}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        aria-label="Rétablir"
        disabled={!state.canRedo}
        title={`Rétablir (${MOD}+Shift+Z)`}
        onMouseDown={keepFocus}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <RedoIcon />
      </button>
      <div className="nano-separator" role="separator" aria-orientation="vertical" />
      <button
        type="button"
        className="nano-bold"
        aria-label="Gras"
        aria-pressed={state.bold}
        title={`Gras (${MOD}+B)`}
        onMouseDown={keepFocus}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        G
      </button>
      <button
        type="button"
        className="nano-italic"
        aria-label="Italique"
        aria-pressed={state.italic}
        title={`Italique (${MOD}+I)`}
        onMouseDown={keepFocus}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        I
      </button>
    </div>
  );
}
