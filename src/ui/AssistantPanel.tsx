// Panneau de l'assistant sous la barre de mise en forme (T3.1), dans la partie figée (M1), au style des messages (messages.css) :
// demande en cours, message d'erreur, barre des modifications proposées (critère 8) et panneau de
// traduction (critère 12). Les boutons d'une modification s'affichent à côté d'elle (SuggestionActions.tsx,
// découpé en M1).
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { useState } from "react";
import { insertParagraphsAfter, replaceWithParagraphs } from "../editor/assistantEdits";
import { acceptSuggestions, goToSuggestion, rejectSuggestions } from "../editor/suggestionCommands";
import { suggestionState } from "../editor/suggestions";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, SuggestionIcon, WarningIcon } from "./icons";
import { SuggestionActions } from "./SuggestionActions";
import type { AssistantStatus, Translation } from "./useAssistant";

const keepFocus = (event: React.MouseEvent) => event.preventDefault();

/** « 1 modification proposée », « 4 modifications proposées ». */
function suggestionCount(count: number): string {
  return count === 1 ? "1 modification proposée" : `${count} modifications proposées`;
}

/**
 * Panneau de l'assistant.
 * @param editor éditeur du document
 * @param status état de la demande (useAssistant)
 * @param onCancel annule la demande en cours
 * @param onDismiss ferme le panneau ; les propositions restantes disparaissent (critère 10)
 * @param coveredTop hauteur cachée par la partie figée en haut de la fenêtre (M1)
 */
export function AssistantPanel({
  editor,
  status,
  onCancel,
  onDismiss,
  coveredTop,
}: {
  editor: Editor;
  status: AssistantStatus;
  onCancel: () => void;
  onDismiss: () => void;
  coveredTop: () => number;
}) {
  const { count } = useEditorState({
    editor,
    selector: ({ editor: current }) => ({ count: suggestionState(current).suggestions.length }),
  });

  if (status.kind === "pending") {
    return (
      <div className="nano-assistant-row">
        <div className="nano-message nano-message-info">
          <span className="nano-message-icon" aria-hidden="true">
            <SuggestionIcon />
          </span>
          <p role="status" className="nano-message-text">
            {status.task === "correct" ? "Correction en cours…" : "Traduction en cours…"}
          </p>
          <button type="button" className="nano-message-secondary" onClick={onCancel}>
            Annuler (Échap)
          </button>
        </div>
      </div>
    );
  }
  if (status.kind === "message") {
    return (
      <div className="nano-assistant-row">
        <div className={`nano-message nano-message-${status.alert ? "alert" : "info"}`}>
          <span className="nano-message-icon" aria-hidden="true">
            {status.alert ? <WarningIcon /> : <SuggestionIcon />}
          </span>
          <p role={status.alert ? "alert" : "status"} className="nano-message-text">
            {status.text}
          </p>
          <CloseButton label="Fermer le message" onClick={onDismiss} />
        </div>
      </div>
    );
  }
  if (status.kind === "translation") {
    return (
      <TranslationPanel editor={editor} translation={status.translation} onDismiss={onDismiss} />
    );
  }
  if (count === 0) return null;
  return (
    <div className="nano-assistant-row">
      <div
        className="nano-message nano-message-info nano-suggestion-bar"
        role="region"
        aria-label="Modifications proposées"
      >
        <span className="nano-message-icon" aria-hidden="true">
          <SuggestionIcon />
        </span>
        <p role="status" className="nano-message-text">
          {suggestionCount(count)}
        </p>
        <button
          type="button"
          className="nano-message-icon-button"
          aria-label="Modification précédente"
          title="Modification précédente"
          onMouseDown={keepFocus}
          onClick={() => goToSuggestion(editor, -1)}
        >
          <ChevronUpIcon />
        </button>
        <button
          type="button"
          className="nano-message-icon-button"
          aria-label="Modification suivante"
          title="Modification suivante"
          onMouseDown={keepFocus}
          onClick={() => goToSuggestion(editor, 1)}
        >
          <ChevronDownIcon />
        </button>
        <button
          type="button"
          className="nano-message-secondary"
          onMouseDown={keepFocus}
          onClick={() => rejectSuggestions(editor, "all")}
        >
          Tout refuser
        </button>
        <button
          type="button"
          className="nano-message-action"
          onMouseDown={keepFocus}
          onClick={() => acceptSuggestions(editor, "all")}
        >
          Tout accepter
        </button>
        <CloseButton label="Fermer les propositions" onClick={onDismiss} />
      </div>
      <SuggestionActions editor={editor} coveredTop={coveredTop} />
    </div>
  );
}

function CloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="nano-message-close"
      aria-label={label}
      title={label}
      onMouseDown={keepFocus}
      onClick={onClick}
    >
      <CloseIcon />
    </button>
  );
}

/**
 * Panneau de traduction (critère 12) : la traduction, en texte seul (critère 16), avec « Remplacer la
 * sélection », « Insérer après » et « Copier ». Si le texte d'origine a changé, seul « Copier » reste.
 */
function TranslationPanel({
  editor,
  translation,
  onDismiss,
}: {
  editor: Editor;
  translation: Translation;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState<boolean | null>(null);
  // Relu à chaque transaction : les paragraphes d'origine suivent le document, ou disparaissent.
  const ranges = useEditorState({ editor, selector: () => translation.ranges() });
  const apply = (how: "replace" | "insert") => {
    if (!ranges) return;
    if (how === "replace") {
      replaceWithParagraphs(editor, ranges, translation.paragraphs, translation.aligned);
    } else insertParagraphsAfter(editor, ranges, translation.paragraphs);
    onDismiss();
  };
  return (
    <div className="nano-assistant-row">
      <div
        className="nano-message nano-message-info nano-translation"
        role="region"
        aria-label="Traduction en anglais"
      >
        <span className="nano-message-icon" aria-hidden="true">
          <SuggestionIcon />
        </span>
        <div className="nano-translation-text" lang="en">
          {translation.paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
        <CloseButton label="Fermer la traduction" onClick={onDismiss} />
        <div className="nano-translation-buttons">
          {!ranges && <span className="nano-translation-note">Le texte d'origine a changé.</span>}
          <button
            type="button"
            className="nano-message-secondary"
            onClick={() => {
              navigator.clipboard
                .writeText(translation.paragraphs.join("\n\n"))
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          >
            {copied === true ? "Copié" : copied === false ? "Copie impossible" : "Copier"}
          </button>
          <button
            type="button"
            className="nano-message-secondary"
            disabled={!ranges}
            onMouseDown={keepFocus}
            onClick={() => apply("insert")}
          >
            Insérer après
          </button>
          <button
            type="button"
            className="nano-message-action"
            disabled={!ranges}
            onMouseDown={keepFocus}
            onClick={() => apply("replace")}
          >
            Remplacer la sélection
          </button>
        </div>
      </div>
    </div>
  );
}
