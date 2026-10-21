// Panneau de l'assistant sous la barre de mise en forme (T3.1), au style des messages (messages.css) :
// demande en cours, message d'erreur, barre des modifications proposées (critère 8) et panneau de
// traduction (critère 12). Les boutons d'une modification s'affichent à côté d'elle (`SuggestionActions`).
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { useEffect, useState } from "react";
import { insertParagraphsAfter, replaceWithParagraphs } from "../editor/assistantEdits";
import {
  acceptSuggestions,
  goToSuggestion,
  rejectSuggestions,
  suggestionState,
} from "../editor/suggestions";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  SuggestionIcon,
  WarningIcon,
} from "./icons";
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
 */
export function AssistantPanel({
  editor,
  status,
  onCancel,
  onDismiss,
}: {
  editor: Editor;
  status: AssistantStatus;
  onCancel: () => void;
  onDismiss: () => void;
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
      <SuggestionActions editor={editor} />
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
 * Boutons « Accepter » et « Refuser » de la modification choisie, juste sous elle dans le texte
 * (critère 8). Ils suivent la page quand elle défile. Un clic sur une autre modification la choisit.
 */
function SuggestionActions({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const state = suggestionState(current);
      return state.suggestions.find((suggestion) => suggestion.id === state.active) ?? null;
    },
  });
  // Redessine à chaque défilement ou changement de taille : la position vient de l'éditeur.
  const [, setTick] = useState(0);
  useEffect(() => {
    const redraw = () => setTick((tick) => tick + 1);
    window.addEventListener("scroll", redraw, true);
    window.addEventListener("resize", redraw);
    return () => {
      window.removeEventListener("scroll", redraw, true);
      window.removeEventListener("resize", redraw);
    };
  }, []);
  if (!active || editor.isDestroyed) return null;
  let position: { top: number; left: number };
  try {
    const coords = editor.view.coordsAtPos(active.from);
    position = { top: coords.bottom + 6, left: Math.max(8, coords.left - 4) };
  } catch {
    return null;
  }
  const label =
    active.removed && active.insert
      ? `« ${active.removed} » remplacé par « ${active.insert} »`
      : active.insert
        ? `« ${active.insert} » ajouté`
        : `« ${active.removed} » retiré`;
  return (
    <div
      className="nano-suggestion-actions"
      role="group"
      aria-label={`Modification choisie : ${label}`}
      style={position}
    >
      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={() => acceptSuggestions(editor, [active.id])}
      >
        <CheckIcon />
        Accepter
      </button>
      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={() => rejectSuggestions(editor, [active.id])}
      >
        <CloseIcon />
        Refuser
      </button>
    </div>
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
