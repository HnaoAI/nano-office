// Barre de mise en forme flottante (T0b, style U1a), dans l'ordre de la maquette : Annuler, Rétablir |
// style du paragraphe (T1.1), police et taille (T1.4) | Gras, Italique, Barré (T2.3), couleur du texte et surlignage
// (T1.7) | alignement (T1.3), interligne (T2.2) | listes (T1.2) | tableau (T1.8), image (T1.9).
// Lit l'état de l'éditeur avec useEditorState pour mettre à jour les contrôles à chaque modification.
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { currentAlignment } from "../editor/alignment";
import { currentBlockStyle } from "../editor/blockStyle";
import { currentTextStyle } from "../editor/fontStyle";
import { currentLineHeight } from "../editor/lineHeight";
import { currentListType } from "../editor/lists";
import { selectedImage } from "../editor/images";
import { headerRowActive, isInTable, tableDeletions } from "../editor/tables";
import { currentHighlight, currentTextColor } from "../editor/textColor";
import { RedoIcon, StrikeIcon, UndoIcon } from "./icons";
import { AlignmentButtons } from "./AlignmentButtons";
import { ColorButtons } from "./ColorButtons";
import { FontSelects } from "./FontSelects";
import { ImageButtons } from "./ImageButtons";
import { LineHeightSelect } from "./LineHeightSelect";
import { ListButtons } from "./ListButtons";
import { ParagraphStyleSelect } from "./ParagraphStyleSelect";
import { TableButtons } from "./TableButtons";
import { MOD } from "./shortcuts";

/**
 * Barre de mise en forme. Gras, Italique et Barré indiquent leur état avec `aria-pressed`.
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
      strike: current.isActive("strike"),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
      blockStyle: currentBlockStyle(current.state),
      listType: currentListType(current.state),
      alignment: currentAlignment(current.state),
      lineHeight: currentLineHeight(current.state),
      textStyle: currentTextStyle(current.state),
      textColor: currentTextColor(current.state),
      highlight: currentHighlight(current.state),
      inTable: isInTable(current.state),
      headerRow: headerRowActive(current.state),
      tableDeletions: tableDeletions(current.state),
      imageAlt: selectedImage(current.state)?.alt ?? null,
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
      <button
        type="button"
        aria-label="Barré"
        aria-pressed={state.strike}
        title={`Barré (${MOD}+Shift+X)`}
        onMouseDown={keepFocus}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <StrikeIcon />
      </button>
      <ColorButtons editor={editor} textColor={state.textColor} highlight={state.highlight} />
      <div className="nano-separator" aria-hidden="true" />
      <AlignmentButtons editor={editor} active={state.alignment} />
      <LineHeightSelect editor={editor} value={state.lineHeight} />
      <div className="nano-separator" aria-hidden="true" />
      <ListButtons editor={editor} active={state.listType} />
      <div className="nano-separator" aria-hidden="true" />
      <TableButtons
        editor={editor}
        inTable={state.inTable}
        headerRow={state.headerRow}
        canDelete={state.tableDeletions}
      />
      <ImageButtons editor={editor} selectedAlt={state.imageAlt} />
    </div>
  );
}
