// Barre « Rechercher et remplacer » (T2.1), sous la barre de mise en forme, à droite, au style des
// messages d'information. La recherche elle-même est dans src/editor/search.ts.
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { replacementStatus, searchStatus } from "../core/search";
import { focusEditor } from "../editor/focus";
import { isMacPlatform } from "../editor/platform";
import {
  clearSearch,
  goToMatch,
  replaceAll,
  replaceCurrent,
  searchState,
  setSearch,
} from "../editor/search";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from "./icons";
import type { SearchMode } from "./useSearchShortcuts";

/** Demande d'ouverture de la barre : chaque raccourci en crée une nouvelle (`id`). */
export interface SearchRequest {
  id: number;
  mode: SearchMode;
  /** Texte sélectionné dans le document au moment du raccourci, repris dans le champ (critère 1). */
  seed: string | null;
}

/**
 * Annuler (`undo`) ou rétablir (`redo`) demandé au clavier, à la touche physique : Ctrl/Cmd+Z,
 * Ctrl/Cmd+Shift+Z, et Ctrl+Y hors Mac. null pour une autre touche.
 */
function undoShortcut(event: React.KeyboardEvent): "undo" | "redo" | null {
  const mac = isMacPlatform();
  const mod = mac ? event.metaKey : event.ctrlKey;
  const other = mac ? event.ctrlKey : event.metaKey;
  if (!mod || other || event.altKey) return null;
  if (event.code === "KeyZ") return event.shiftKey ? "redo" : "undo";
  if (event.code === "KeyY" && !mac && !event.shiftKey) return "redo";
  return null;
}

/**
 * Barre de recherche. Le champ prend le focus à chaque ouverture. Entrée va à l'occurrence suivante,
 * Shift+Entrée à la précédente (critère 2). Échap ferme la barre, retire les surlignages et rend
 * le focus au document, sur l'occurrence trouvée (critère 1).
 * @param editor éditeur où chercher
 * @param request dernière demande d'ouverture
 * @param onClose appelé à la fermeture
 */
export function SearchBar({
  editor,
  request,
  onClose,
}: {
  editor: Editor;
  request: SearchRequest;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(request.seed ?? "");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(request.mode === "replace");
  const [replacement, setReplacement] = useState("");
  const [replaced, setReplaced] = useState<number | null>(null);
  const queryRef = useRef<HTMLInputElement | null>(null);
  const replaceRef = useRef<HTMLInputElement | null>(null);
  // Vrai après un remplacement, jusqu'à la prochaine frappe dans un champ : Ctrl/Cmd+Z annule alors
  // le remplacement dans le document, et non la frappe du champ (critère 6, relecture de la PR).
  const undoInDocument = useRef(false);
  const { active, total } = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const state = searchState(current);
      return { active: state.active, total: state.matches.length };
    },
  });

  // Nouvelle demande (raccourci, barre déjà ouverte) : reprend la sélection et ouvre le remplacement
  // si demandé, pendant le rendu plutôt que dans un effet (règle « set-state-in-effect » de React).
  const [handled, setHandled] = useState(request);
  if (handled !== request) {
    setHandled(request);
    if (request.seed) setQuery(request.seed);
    if (request.mode === "replace") setReplaceOpen(true);
    setReplaced(null);
  }

  // Chaque demande donne le focus au champ de recherche, son texte sélectionné.
  useEffect(() => {
    queryRef.current?.focus();
    queryRef.current?.select();
  }, [request]);

  useEffect(() => {
    setSearch(editor, query, caseSensitive);
  }, [editor, query, caseSensitive]);

  // Barre fermée (ou éditeur remplacé) : plus aucun surlignage.
  useEffect(() => () => clearSearch(editor), [editor]);

  const close = () => {
    clearSearch(editor);
    onClose();
    focusEditor(editor);
  };
  const go = (direction: 1 | -1) => {
    setReplaced(null);
    goToMatch(editor, direction);
  };
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();
  const status =
    replaced === null ? searchStatus(query, active, total) : replacementStatus(replaced);

  return (
    <div className="nano-search-row">
      <div
        className="nano-search-bar"
        role="search"
        aria-label="Rechercher dans le document"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
          }
          const history = undoInDocument.current ? undoShortcut(event) : null;
          if (!history) return;
          event.preventDefault();
          if (history === "undo") editor.commands.undo();
          else editor.commands.redo();
        }}
      >
        <div className="nano-search-line">
          <input
            ref={queryRef}
            className="nano-search-input"
            type="text"
            aria-label="Rechercher"
            placeholder="Rechercher"
            value={query}
            onChange={(event) => {
              undoInDocument.current = false;
              setReplaced(null);
              setQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              go(event.shiftKey ? -1 : 1);
            }}
          />
          <span className="nano-search-status" role="status">
            {status}
          </span>
          <button
            type="button"
            className="nano-search-icon"
            aria-label="Occurrence précédente"
            title="Occurrence précédente (Shift+Entrée)"
            disabled={total === 0}
            onMouseDown={keepFocus}
            onClick={() => go(-1)}
          >
            <ChevronUpIcon />
          </button>
          <button
            type="button"
            className="nano-search-icon"
            aria-label="Occurrence suivante"
            title="Occurrence suivante (Entrée)"
            disabled={total === 0}
            onMouseDown={keepFocus}
            onClick={() => go(1)}
          >
            <ChevronDownIcon />
          </button>
          <button
            type="button"
            className="nano-search-icon"
            aria-label="Fermer la recherche"
            title="Fermer (Échap)"
            onClick={close}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="nano-search-line">
          <label className="nano-search-option">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(event) => {
                setReplaced(null);
                setCaseSensitive(event.target.checked);
              }}
            />
            Respecter les majuscules
          </label>
          <button
            type="button"
            className="nano-search-text"
            aria-expanded={replaceOpen}
            onClick={() => {
              setReplaceOpen((open) => !open);
              requestAnimationFrame(() => replaceRef.current?.focus());
            }}
          >
            Remplacer…
          </button>
        </div>
        {replaceOpen && (
          <div className="nano-search-line">
            <input
              ref={replaceRef}
              className="nano-search-input"
              type="text"
              aria-label="Remplacer par"
              placeholder="Remplacer par"
              value={replacement}
              onChange={(event) => {
                undoInDocument.current = false;
                setReplacement(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                setReplaced(null);
                undoInDocument.current = replaceCurrent(editor, replacement);
              }}
            />
            <button
              type="button"
              className="nano-search-text"
              disabled={total === 0}
              onMouseDown={keepFocus}
              onClick={() => {
                setReplaced(null);
                undoInDocument.current = replaceCurrent(editor, replacement);
              }}
            >
              Remplacer
            </button>
            <button
              type="button"
              className="nano-search-text nano-search-primary"
              disabled={total === 0}
              onMouseDown={keepFocus}
              onClick={() => {
                const count = replaceAll(editor, replacement);
                undoInDocument.current = count > 0;
                setReplaced(count);
              }}
            >
              Tout remplacer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
