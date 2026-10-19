// Hook React du document affiché (T0c) : Nouveau, Ouvrir, Enregistrer, Enregistrer sous, Ctrl/Cmd+S,
// titre de la fenêtre et messages, puis restauration et question de la copie de secours (T0d).
// La logique vient de src/core/, les fichiers et la copie de secours de src/storage/.
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { compareWithBackup, recoveredDocument, restoredDocument } from "../core/backup";
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
import type * as Y from "yjs";
import { createBackupStore } from "../storage/backupStore";
import { createFileStore, type SaveResult } from "../storage/fileStore";
import { useBackup } from "./useBackup";

/** Message affiché sous la barre de menus : information (`status`) ou erreur (`alert`). */
export interface FileMessage {
  kind: "status" | "alert";
  text: string;
}

const DISCARD_QUESTION =
  "Les modifications non enregistrées de ce document seront perdues. Voulez-vous continuer ?";
const READ_ERROR = "Le fichier n'a pas pu être lu. Le document en cours n'a pas changé.";
const RECOVERED_MESSAGE =
  "Ce document a été récupéré depuis la copie de secours de ce navigateur. Enregistrez-le pour le garder dans un fichier.";
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

/** Fichier ouvert dont la copie de secours diffère, en attente du choix de l'utilisateur (T0d, critère 8). */
export interface PendingBackup {
  file: OpenDocument;
  backup: Y.Doc;
}

/**
 * Document affiché et actions sur les fichiers.
 * INVARIANT : « Nouveau » et « Ouvrir » remplacent le document par un autre, avec un Y.Doc neuf ;
 * l'éditeur doit être recréé pour ce Y.Doc (clé `document.ydoc.guid`), avec un historique vide (critère 10).
 * `document` vaut null pendant la lecture de la copie de secours, au chargement de la page.
 */
export function useDocumentFile() {
  const [store] = useState(createFileStore);
  const [backups] = useState(createBackupStore);
  const [document, setDocument] = useState<OpenDocument | null>(null);
  const [pending, setPending] = useState<PendingBackup | null>(null);
  const [message, setMessage] = useState<FileMessage | null>(null);
  const saving = useRef(false);
  const choosing = useRef(false);

  const subscribe = useCallback(
    (onChange: () => void) => {
      document?.ydoc.on("update", onChange);
      return () => document?.ydoc.off("update", onChange);
    },
    [document?.ydoc],
  );
  const unsaved = useSyncExternalStore(
    subscribe,
    () => document !== null && hasUnsavedChanges(document),
  );
  const backupLinked = useBackup(backups, document, unsaved);

  useEffect(() => {
    window.document.title = windowTitle(document?.fileName ?? null, unsaved);
  }, [document?.fileName, unsaved]);

  // Au chargement, le dernier document modifié est restauré depuis sa copie de secours (T0d, critère 4).
  useEffect(() => {
    let cancelled = false;
    const id = backups.lastModifiedId();
    void (id ? backups.read(id) : Promise.resolve(null)).then((backup) => {
      if (cancelled) return;
      const restored = id ? restoredDocument(id, backup) : null;
      setDocument(restored ?? createNewDocument());
      if (restored) setMessage({ kind: "status", text: RECOVERED_MESSAGE });
    });
    return () => {
      cancelled = true;
    };
  }, [backups]);

  /** Demande confirmation avant d'abandonner des modifications non enregistrées (critère 1). */
  function canDiscard(): boolean {
    return !unsaved || window.confirm(DISCARD_QUESTION);
  }

  /** Affiche un autre document. INVARIANT : sa copie de secours est absente, identique ou effacée. */
  function show(next: OpenDocument) {
    // L'utilisateur a accepté de perdre ces modifications : elles ne reviennent plus au chargement.
    // Leur copie reste dans IndexedDB, pour le futur mode récupération (#15). Décision de relecture de T0d.
    if (document && unsaved && backups.lastModifiedId() === document.id) {
      backups.setLastModifiedId(null);
    }
    setPending(null);
    setMessage(null);
    setDocument(next);
  }

  function newDocument() {
    if (!canDiscard()) return;
    store.forget();
    show(createNewDocument());
  }

  /**
   * Affiche un fichier ouvert après l'avoir comparé à sa copie de secours (T0d) : la copie n'est jamais
   * appliquée sur le fichier (critère 6). Identique, elle est effacée puis recréée à partir du fichier,
   * car deux historiques Yjs au même contenu s'additionneraient (critère 7). Différente, on demande (critère 8).
   */
  async function showOpenedFile(file: OpenDocument) {
    const backup = await backups.read(file.id);
    const comparison = compareWithBackup(file, backup);
    if (comparison === "different" && backup) {
      setMessage(null);
      setPending({ file, backup });
      return;
    }
    if (comparison === "same") await backups.remove(file.id);
    show(file);
  }

  /** Réponse à la question de la copie de secours (critères 9 et 10). Un seul choix est pris en compte. */
  async function resolvePending(recover: boolean) {
    if (!pending || choosing.current) return;
    choosing.current = true;
    try {
      if (recover) {
        show(recoveredDocument(pending.file, pending.backup));
      } else {
        await backups.remove(pending.file.id);
        show(pending.file);
      }
    } finally {
      choosing.current = false;
    }
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
      await showOpenedFile(opened);
    } else if (error) {
      setMessage({ kind: "alert", text: error });
    }
  }

  async function save(asNew: boolean) {
    if (saving.current || !document) return;
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
    backupLinked,
    message,
    pending,
    recover: () => void resolvePending(true),
    openAsIs: () => void resolvePending(false),
    newDocument,
    open: () => void open(),
    save: () => void save(false),
    saveAs: () => void save(true),
  };
}
