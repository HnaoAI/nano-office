// Boutons « Accepter » et « Refuser » de la modification choisie par l'assistant (T3.1, critère 8),
// posés sous elle dans le texte. Découpé de AssistantPanel.tsx (M1), sans changement.
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { useEffect, useState } from "react";
import { acceptSuggestions, rejectSuggestions } from "../editor/suggestionCommands";
import { suggestionState } from "../editor/suggestions";
import { CheckIcon, CloseIcon } from "./icons";

const keepFocus = (event: React.MouseEvent) => event.preventDefault();

/**
 * Boutons « Accepter » et « Refuser » de la modification choisie, juste sous elle dans le texte
 * (critère 8). Ils suivent la page quand elle défile. Un clic sur une autre modification la choisit.
 */
export function SuggestionActions({ editor }: { editor: Editor }) {
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
