// Barre de mise en forme flottante (T0b, style U1a), dans l'ordre de la maquette : Annuler, Rétablir |
// style du paragraphe (T1.1), police et taille (T1.4) | Gras, Italique, couleur du texte et surlignage
// (T1.7) | alignement (T1.3) | listes (T1.2) | tableau (T1.8).
// Lit l'état de l'éditeur avec useEditorState pour mettre à jour les contrôles à chaque modification.
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { currentAlignment } from "../editor/alignment";
import { currentBlockStyle } from "../editor/blockStyle";
import { currentTextStyle } from "../editor/fontStyle";
import { currentListType } from "../editor/lists";
import { headerRowActive, isInTable, tableDeletions } from "../editor/tables";
import { currentHighlight, currentTextColor } from "../editor/textColor";
import { RedoIcon, UndoIcon } from "./icons";
import { AlignmentButtons } from "./AlignmentButtons";
import { ColorButtons } from "./ColorButtons";
import { FontSelects } from "./FontSelects";
import { ListButtons } from "./ListButtons";
import { ParagraphStyleSelect } from "./ParagraphStyleSelect";
import { TableButtons } from "./TableButtons";
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
      textStyle: currentTextStyle(current.state),
      textColor: currentTextColor(current.state),
      highlight: currentHighlight(current.state),
      inTable: isInTable(current.state),
      headerRow: headerRowActive(current.state),
      tableDeletions: tableDeletions(current.state),
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
      <FontSelects editor={editor} font={state.textStyle.font} size={state.textStyle.size} />
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
      <ColorButtons editor={editor} textColor={state.textColor} highlight={state.highlight} />
      <div className="nano-separator" aria-hidden="true" />
      <AlignmentButtons editor={editor} active={state.alignment} />
      <div className="nano-separator" aria-hidden="true" />
      <ListButtons editor={editor} active={state.listType} />
      <div className="nano-separator" aria-hidden="true" />
      <TableButtons
        editor={editor}
        inTable={state.inTable}
        headerRow={state.headerRow}
        canDelete={state.tableDeletions}
      />
    </div>
  );
}
