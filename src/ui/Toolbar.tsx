// Barre de mise en forme flottante (T0b, style U1a), dans l'ordre de la maquette : Annuler, Rétablir |
// style du paragraphe (T1.1), police et taille (T1.4) | Gras, Italique, Souligné (T2.10), Barré (T2.3), couleur du texte et surlignage
// (T1.7), majuscules et minuscules (T2.4) | alignement (T1.3), interligne (T2.2) | listes (T1.2) | tableau (T1.8), image (T1.9),
// saut de page (T2.8) | mise en page (T2.5), plan (T2.9) | groupe « Assistant », seulement quand l'assistant est en marche (T3.1).
// Lit l'état de l'éditeur avec useEditorState pour mettre à jour les contrôles à chaque modification.
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { currentAlignment } from "../editor/alignment";
import { currentBlockStyle } from "../editor/blockStyle";
import { currentTextStyle } from "../editor/fontStyle";
import { currentLineHeight } from "../editor/lineHeight";
import { currentListType } from "../editor/lists";
import { selectedImage } from "../editor/images";
import { insertPageBreak } from "../editor/pageBreak";
import { headerRowActive, isInTable, tableDeletions } from "../editor/tables";
import { currentHighlight, currentTextColor } from "../editor/textColor";
import {
  OutlineIcon,
  PageBreakIcon,
  PageSetupIcon,
  RedoIcon,
  StrikeIcon,
  UnderlineIcon,
  UndoIcon,
} from "./icons";
import { AlignmentButtons } from "./AlignmentButtons";
import { AssistantButtons } from "./AssistantButtons";
import { CaseButton } from "./CaseButton";
import { ColorButtons } from "./ColorButtons";
import { FontSelects } from "./FontSelects";
import { ImageButtons } from "./ImageButtons";
import { LineHeightSelect } from "./LineHeightSelect";
import { ListButtons } from "./ListButtons";
import { ParagraphStyleSelect } from "./ParagraphStyleSelect";
import { TableButtons } from "./TableButtons";
import { MOD } from "./shortcuts";
import type { AssistantTask } from "../core/assistant";

/** Groupe « Assistant » de la barre (T3.1) ; absent quand l'assistant est éteint (critère 4). */
export interface ToolbarAssistant {
  online: boolean;
  pending: boolean;
  onRun: (task: AssistantTask) => void;
}

/**
 * Barre de mise en forme. Gras, Italique, Souligné et Barré indiquent leur état avec `aria-pressed`.
 * Les séparateurs ajoutés par T1 sont décoratifs (`aria-hidden`), comme dans la maquette ; seul le
 * premier garde le rôle `separator` (U1a).
 * INVARIANT : les noms accessibles (« Annuler », « Rétablir », « Gras », « Italique ») ne changent pas,
 * même si le bouton n'affiche qu'une icône ou une lettre (U1a, critère 7).
 * @param editor éditeur Tiptap à piloter
 * @param onPageSetup ouvre la boîte « Mise en page » (T2.5)
 * @param assistant groupe « Assistant » (T3.1), null quand l'assistant est éteint
 * @param outline bouton « Plan » (T2.9) : panneau ouvert ou fermé, et action qui l'ouvre ou le ferme
 */
export function Toolbar({
  editor,
  onPageSetup,
  assistant,
  outline,
}: {
  editor: Editor;
  onPageSetup: () => void;
  assistant: ToolbarAssistant | null;
  outline: { open: boolean; onToggle: () => void };
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      strike: current.isActive("strike"),
      script: current.isActive("superscript")
        ? ("superscript" as const)
        : current.isActive("subscript")
          ? ("subscript" as const)
          : null,
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
      hasSelection: !current.state.selection.empty,
      hasSelectedText: current.state.selection.ranges.some(
        ({ $from, $to }) => current.state.doc.textBetween($from.pos, $to.pos, " ").trim() !== "",
      ),
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
        aria-label="Souligné"
        aria-pressed={state.underline}
        title={`Souligné (${MOD}+U)`}
        onMouseDown={keepFocus}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon />
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
      <CaseButton editor={editor} hasSelection={state.hasSelection} script={state.script} />
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
      <button
        type="button"
        aria-label="Saut de page"
        title={`Saut de page (${MOD}+Entrée)`}
        onMouseDown={keepFocus}
        onClick={() => {
          editor.commands.focus();
          insertPageBreak(editor);
        }}
      >
        <PageBreakIcon />
      </button>
      <div className="nano-separator" aria-hidden="true" />
      {/* Dans la barre plutôt que dans le groupe Fichier, pour que l'en-tête tienne sur une ligne
          à 1 280 px de large (T2.5, choix à confirmer). */}
      <button
        type="button"
        aria-label="Mise en page…"
        title="Mise en page : orientation et marges"
        onMouseDown={keepFocus}
        onClick={onPageSetup}
      >
        <PageSetupIcon />
      </button>
      {/* Activé comme l'alignement (fond gris clair) : c'est un affichage, pas une mise en forme (T2.9). */}
      <button
        type="button"
        className="nano-block-button"
        aria-label="Plan"
        aria-pressed={outline.open}
        title="Plan du document : aller à un titre, déplacer une partie"
        onMouseDown={keepFocus}
        onClick={outline.onToggle}
      >
        <OutlineIcon />
      </button>
      {assistant && (
        <>
          <div className="nano-separator" aria-hidden="true" />
          <AssistantButtons hasSelection={state.hasSelectedText} {...assistant} />
        </>
      )}
    </div>
  );
}
