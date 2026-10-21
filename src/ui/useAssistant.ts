// Hook React de l'assistant dans l'éditeur affiché (T3.1) : « Corriger » et « Traduire en anglais »,
// demande en cours annulée par Échap, réponse transformée en propositions ou en traduction, messages.
// Les appels réseau sont dans src/assistant/, les propositions dans src/editor/suggestions.ts.
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  buildRequest,
  correctionChanges,
  failureMessage,
  parseParagraphs,
  type AssistantFailureDetails,
  type AssistantFailureKind,
  type AssistantTask,
} from "../core/assistant";
import { countWords, MAX_ASSISTANT_WORDS } from "../core/wordDiff";
import { AssistantFailure } from "../assistant/failure";
import { createProvider, sendWithTimeout } from "../assistant/provider";
import {
  selectedParagraphs,
  watchRanges,
  type DocRange,
  type SelectedParagraph,
} from "../editor/assistantEdits";
import { focusEditor } from "../editor/focus";
import { clearSuggestions, showSuggestions, suggestionsFor } from "../editor/suggestions";
import type { AssistantConfig } from "./useAssistantSettings";

/** Traduction affichée dans le panneau, avec les paragraphes d'origine suivis dans le document. */
export interface Translation {
  paragraphs: string[];
  /** Vrai si la réponse donne un paragraphe traduit par paragraphe envoyé. */
  aligned: boolean;
  /** Paragraphes traduits, à jour et dans l'ordre du texte ; null si leur texte a changé (critère 10). */
  ranges: () => DocRange[] | null;
}

/** Ce que montre le panneau de l'assistant, en plus des propositions de l'éditeur. */
export type AssistantStatus =
  | { kind: "idle" }
  | { kind: "pending"; task: AssistantTask }
  | { kind: "message"; alert: boolean; text: string }
  | { kind: "translation"; translation: Translation };

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** Vrai quand le navigateur se dit en ligne (critère 5 : boutons grisés hors ligne). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine);
}

/**
 * Raison d'un abandon sans message : assistant éteint ou panneau fermé. Seul un abandon demandé par
 * l'utilisateur (Échap, « Annuler ») affiche « Demande annulée ».
 */
const SILENT_ABORT = "silent";

/** Vrai si une boîte de dialogue (Réglages, Mise en page) est ouverte : Échap lui revient. */
function dialogOpen(): boolean {
  return document.querySelector('[role="dialog"]') !== null;
}

function message(kind: AssistantFailureKind, details?: AssistantFailureDetails): AssistantStatus {
  return { kind: "message", alert: kind !== "cancelled", text: failureMessage(kind, details) };
}

/**
 * Assistant d'un éditeur.
 * INVARIANT : aucune requête sans clic sur « Corriger » ou « Traduire en anglais » (critère 13), et
 * aucune quand l'assistant est éteint (`config` null, critère 4).
 * @param editor éditeur du document affiché
 * @param config fournisseur, modèle et clé ; null quand l'assistant est éteint
 * @returns `status`, `online`, `run(task)`, `cancel()`, `dismiss()`
 */
export function useAssistant(editor: Editor, config: AssistantConfig | null) {
  const [status, setStatus] = useState<AssistantStatus>({ kind: "idle" });
  const online = useOnline();
  const controller = useRef<AbortController | null>(null);
  const stopWatching = useRef<(() => void) | null>(null);

  const release = useCallback(() => {
    stopWatching.current?.();
    stopWatching.current = null;
  }, []);

  const cancel = useCallback(() => controller.current?.abort(), []);

  // Le bouton qui ferme le panneau disparaît avec lui : le focus revient dans le texte.
  const dismiss = useCallback(() => {
    controller.current?.abort(SILENT_ABORT);
    release();
    clearSuggestions(editor);
    setStatus({ kind: "idle" });
    focusEditor(editor);
  }, [release, editor]);

  // Assistant éteint : la demande en cours est abandonnée et le panneau se ferme (critère 4). Un autre
  // document remplace tout le composant (clé de DocumentEditor), ce qui passe par l'effet suivant.
  useEffect(() => {
    if (config) return;
    controller.current?.abort(SILENT_ABORT);
    release();
    clearSuggestions(editor);
    // Fermeture du panneau quand l'assistant s'éteint : rien d'autre ne la déclencherait.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus((current) => (current.kind === "idle" ? current : { kind: "idle" }));
  }, [config, editor, release]);
  useEffect(
    () => () => {
      controller.current?.abort(SILENT_ABORT);
      stopWatching.current?.();
    },
    [],
  );

  // Échap annule la demande en cours (critère 5), où que soit le focus, sauf dans une boîte de dialogue.
  const pending = status.kind === "pending";
  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || dialogOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      controller.current?.abort();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pending]);

  const run = useCallback(
    async (task: AssistantTask) => {
      if (!config || controller.current) return;
      const sent = selectedParagraphs(editor.state);
      // Sélection sans texte (une image seule, des espaces) : le panneau affiché reste tel quel.
      if (sent.length === 0) return;
      release();
      clearSuggestions(editor);
      const words = countWords(sent.map((paragraph) => paragraph.text).join("\n"));
      if (words > MAX_ASSISTANT_WORDS) {
        setStatus(message("too-long", { words }));
        return;
      }
      if (!config.apiKey) {
        setStatus(message("no-key"));
        return;
      }
      // Texte suivi pendant la demande : modifié entre-temps, la réponse n'est pas appliquée. Une
      // traduction suit les paragraphes envoyés ; une correction suit leurs blocs entiers, puis eux.
      const paragraphRanges = sent.map(({ from, to }) => ({ from, to }));
      const watch = watchRanges(
        editor,
        task === "translate"
          ? paragraphRanges
          : [...sent.map((paragraph) => paragraph.block), ...paragraphRanges],
      );
      stopWatching.current = watch.stop;
      const abort = new AbortController();
      controller.current = abort;
      setStatus({ kind: "pending", task });
      const provider = createProvider({
        provider: config.provider,
        model: config.model,
        apiKey: config.apiKey,
      });
      const details = { provider: config.provider, model: config.model };
      try {
        const raw = await sendWithTimeout(
          provider,
          buildRequest(
            task,
            sent.map((paragraph) => paragraph.text),
          ),
          abort.signal,
        );
        // Réponse arrivée juste après un abandon : elle n'est pas montrée.
        if (abort.signal.aborted) throw new AssistantFailure("cancelled", details);
        const parsed = parseParagraphs(raw, sent.length);
        if (!parsed) throw new AssistantFailure("unreadable", details);
        const ranges = watch.current();
        if (!ranges) throw new AssistantFailure("changed", details);
        if (task === "translate") {
          setStatus({
            kind: "translation",
            translation: {
              paragraphs: parsed.paragraphs,
              aligned: parsed.aligned,
              ranges: () => watch.current(),
            },
          });
          return;
        }
        release();
        const current: SelectedParagraph[] = sent.map((paragraph, index) => ({
          ...paragraph,
          ...(ranges[sent.length + index] ?? {}),
          block: ranges[index] ?? paragraph.block,
        }));
        const changes = correctionChanges(current, parsed);
        if (changes.length === 0) {
          setStatus({
            kind: "message",
            alert: false,
            text: "Aucune faute trouvée dans la sélection.",
          });
          return;
        }
        // La sélection se replie à sa fin : son surlignage cacherait les marques de suggestion.
        editor.commands.setTextSelection(editor.state.selection.to);
        showSuggestions(editor, suggestionsFor(current, changes));
        setStatus({ kind: "idle" });
      } catch (error) {
        release();
        if (abort.signal.reason === SILENT_ABORT) return;
        const failure =
          error instanceof AssistantFailure ? error : new AssistantFailure("failed", details);
        setStatus(message(failure.kind, failure.details));
      } finally {
        controller.current = null;
      }
    },
    [config, editor, release],
  );

  return { status, online, run, cancel, dismiss };
}
