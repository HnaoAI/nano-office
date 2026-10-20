// Barre de mise en forme flottante (T0b, style U1a), dans l'ordre de la maquette : Annuler, Rétablir |
// style du paragraphe (T1.1) | Gras, Italique | alignement (T1.3) | listes (T1.2).
// Lit l'état de l'éditeur avec useEditorState pour mettre à jour les contrôles à chaque modification.
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { currentAlignment } from "../editor/alignment";
import { currentBlockStyle } from "../editor/blockStyle";
import { currentListType } from "../editor/lists";
import { RedoIcon, UndoIcon } from "./icons";
import { AlignmentButtons } from "./AlignmentButtons";
import { ListButtons } from "./ListButtons";
import { ParagraphStyleSelect } from "./ParagraphStyleSelect";
import { MOD } from "./shortcuts";

/**
 * Barre de mise en forme. Gras et Italique indiquent leur état avec `aria-pressed`.
 * Les séparateurs ajoutés par T1 sont décoratifs (`aria-hidden`), comme dans la maquette ; seul le
 * premier garde le rôle `separator` (U1a).
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
      blockStyle: currentBlockStyle(current.state),
      listType: currentListType(current.state),
      alignment: currentAlignment(current.state),
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
      <ParagraphStyleSelect editor={editor} value={state.blockStyle} />
      <div className="nano-separator" aria-hidden="true" />
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
      <div className="nano-separator" aria-hidden="true" />
      <AlignmentButtons editor={editor} active={state.alignment} />
      <div className="nano-separator" aria-hidden="true" />
      <ListButtons editor={editor} active={state.listType} />
    </div>
  );
}
