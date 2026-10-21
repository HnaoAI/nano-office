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
import { clearSuggestions, showSuggestions, suggestionsFor } from "../editor/suggestions";
import type { AssistantConfig } from "./useAssistantSettings";

/** Traduction affichée dans le panneau, avec la sélection d'origine suivie dans le document. */
export interface Translation {
  paragraphs: string[];
  /** Sélection traduite, à jour ; null si son texte a changé depuis (critère 10). */
  range: () => DocRange | null;
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

  const dismiss = useCallback(() => {
    cancel();
    release();
    clearSuggestions(editor);
    setStatus({ kind: "idle" });
  }, [cancel, release, editor]);

  // Assistant éteint, ou éditeur remplacé (autre document) : la demande en cours est abandonnée et
  // le panneau se ferme (critères 4 et 10).
  useEffect(() => {
    if (config) return;
    controller.current?.abort();
    release();
    clearSuggestions(editor);
    // Fermeture du panneau quand l'assistant s'éteint : rien d'autre ne la déclencherait.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus((current) => (current.kind === "idle" ? current : { kind: "idle" }));
  }, [config, editor, release]);
  useEffect(
    () => () => {
      controller.current?.abort();
      stopWatching.current?.();
    },
    [],
  );

  // Échap annule la demande en cours (critère 5), où que soit le focus.
  const pending = status.kind === "pending";
  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
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
      release();
      clearSuggestions(editor);
      const sent = selectedParagraphs(editor.state);
      if (sent.length === 0) return;
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
      // traduction suit la sélection ; une correction suit les blocs entiers, puis chaque paragraphe.
      const { from, to } = editor.state.selection;
      const watch = watchRanges(
        editor,
        task === "translate"
          ? [{ from, to }]
          : [
              ...sent.map((paragraph) => paragraph.block),
              ...sent.map(({ from: start, to: end }) => ({ from: start, to: end })),
            ],
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
        const parsed = parseParagraphs(raw, sent.length);
        if (!parsed) throw new AssistantFailure("unreadable", details);
        const ranges = watch.current();
        if (!ranges) throw new AssistantFailure("changed", details);
        if (task === "translate") {
          setStatus({
            kind: "translation",
            translation: {
              paragraphs: parsed.paragraphs,
              range: () => watch.current()?.[0] ?? null,
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
        showSuggestions(editor, suggestionsFor(current, changes));
        setStatus({ kind: "idle" });
      } catch (error) {
        release();
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
