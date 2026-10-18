// Hook React du document affiché (T0c) : Nouveau, Ouvrir, Enregistrer, Enregistrer sous, Ctrl/Cmd+S,
// titre de la fenêtre et messages. La logique vient de src/core/documentFile.ts, les fichiers de src/storage/.
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  contentSnapshot,
  createNewDocument,
  DEFAULT_FILE_NAME,
  hasUnsavedChanges,
  markSaved,
  openDocumentText,
  windowTitle,
} from "../core/documentFile";
import { serializeDocument } from "../core/fileFormat";
import type { OpenDocument } from "../core/types";
import { createFileStore, type SaveResult } from "../storage/fileStore";

/** Message affiché sous la barre de menus : information (`status`) ou erreur (`alert`). */
export interface FileMessage {
  kind: "status" | "alert";
  text: string;
}

const DISCARD_QUESTION =
  "Les modifications non enregistrées de ce document seront perdues. Voulez-vous continuer ?";
const READ_ERROR = "Le fichier n'a pas pu être lu. Le document en cours n'a pas changé.";
const SAVE_ERROR =
  "Le document n'a pas pu être enregistré. Réessayez, ou choisissez un autre emplacement avec « Enregistrer sous… ».";

/** Message à afficher après un enregistrement, ou null s'il n'y a rien à dire. */
function saveMessage(result: SaveResult): FileMessage | null {
  if (result.status === "downloaded") {
    return {
      kind: "status",
      text: `Le fichier « ${result.name} » a été téléchargé dans votre dossier de téléchargements. Pour enregistrer directement dans le dossier de votre choix, utilisez Chrome ou Edge.`,
    };
  }
  return result.status === "failed" ? { kind: "alert", text: SAVE_ERROR } : null;
}

/** Vrai pour Ctrl+S (Windows) ou Cmd+S (Mac), sans autre touche de modification. */
function isSaveShortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "s"
  );
}

/**
 * Document affiché et actions sur les fichiers.
 * INVARIANT : « Nouveau » et « Ouvrir » remplacent le document par un autre, avec un Y.Doc neuf ;
 * l'éditeur doit être recréé pour ce Y.Doc (clé `document.ydoc.guid`), avec un historique vide (critère 10).
 */
export function useDocumentFile() {
  const [store] = useState(createFileStore);
  const [document, setDocument] = useState(createNewDocument);
  const [message, setMessage] = useState<FileMessage | null>(null);
  const saving = useRef(false);

  const subscribe = useCallback(
    (onChange: () => void) => {
      document.ydoc.on("update", onChange);
      return () => document.ydoc.off("update", onChange);
    },
    [document.ydoc],
  );
  const unsaved = useSyncExternalStore(subscribe, () => hasUnsavedChanges(document));

  useEffect(() => {
    window.document.title = windowTitle(document.fileName, unsaved);
  }, [document.fileName, unsaved]);

  /** Demande confirmation avant d'abandonner des modifications non enregistrées (critère 1). */
  function canDiscard(): boolean {
    return !hasUnsavedChanges(document) || window.confirm(DISCARD_QUESTION);
  }

  function newDocument() {
    if (!canDiscard()) return;
    store.forget();
    setMessage(null);
    setDocument(createNewDocument());
  }

  async function open() {
    if (!canDiscard()) return;
    let opened: OpenDocument | null = null;
    let error: string | null = null;
    try {
      // Le fichier n'est retenu comme fichier courant que s'il est lisible (critère 15).
      const file = await store.open(({ name, text }) => {
        const result = openDocumentText(name, text);
        if (result.ok) opened = result.document;
        else error = result.message;
        return result.ok;
      });
      if (!file) return;
    } catch {
      error = READ_ERROR;
    }
    if (opened) {
      setMessage(null);
      setDocument(opened);
    } else if (error) {
      setMessage({ kind: "alert", text: error });
    }
  }

  async function save(asNew: boolean) {
    if (saving.current) return;
    saving.current = true;
    const saved = document;
    try {
      // Empreinte prise avant l'écriture : une saisie pendant l'enregistrement reste « non enregistrée ».
      const snapshot = contentSnapshot(saved.ydoc);
      const text = serializeDocument(saved);
      const result = asNew
        ? await store.saveAs(text, saved.fileName ?? DEFAULT_FILE_NAME)
        : await store.save(text);
      if (result.status === "saved" || result.status === "downloaded") {
        const name = result.name;
        setDocument((current) =>
          current === saved ? markSaved(current, name, snapshot) : current,
        );
      }
      if (result.status !== "cancelled") setMessage(saveMessage(result));
    } finally {
      saving.current = false;
    }
  }

  // Ctrl/Cmd+S est intercepté sur toute la page, en phase de capture, avant l'éditeur :
  // la fenêtre « Enregistrer la page » du navigateur ne s'ouvre jamais (critère 6).
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!isSaveShortcut(event)) return;
    event.preventDefault();
    void save(false);
  });
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  return {
    document,
    unsaved,
    message,
    newDocument,
    open: () => void open(),
    save: () => void save(false),
    saveAs: () => void save(true),
  };
}
