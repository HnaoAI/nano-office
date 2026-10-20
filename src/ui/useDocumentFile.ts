// Hook React du document affiché (T0c) : Nouveau, Ouvrir, Enregistrer, Enregistrer sous, Ctrl/Cmd+S,
// titre de la fenêtre et messages, puis restauration et question de la copie de secours (T0d).
// Retient aussi les signes de travail commencé, pour la mise à jour au démarrage (H1, critère 6),
// et donne l'état de l'indicateur d'enregistrement et les actions des messages (U1b).
// Fichier retrouvé au lancement pour un document restauré (PL3).
// Sauvegarde automatique dans le fichier, par le même verrou que « Enregistrer » (T1.6).
// La logique vient de src/core/, les fichiers et la copie de secours de src/storage/.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { NO_ACTIVITY, type LaunchActivity } from "../core/appUpdate";
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
import { createFileStore } from "../storage/fileStore";
import {
  DISCARD_QUESTION,
  READ_ERROR,
  recoveredMessage,
  saveMessage,
  type FileMessage,
} from "./fileMessages";
import { useAutoSave } from "./useAutoSave";
import { useBackup } from "./useBackup";
import { useSaveShortcut } from "./useSaveShortcut";

/** État affiché par l'indicateur d'enregistrement de l'en-tête (U1b, critère 2). */
export type SaveState = "saved" | "saving" | "unsaved";

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
  const [activity, setActivity] = useState<LaunchActivity>(NO_ACTIVITY);
  const saving = useRef(false);
  // Copie lisible de `saving` pour l'indicateur (U1b) ; la référence reste le seul verrou d'enregistrement.
  const [writing, setWriting] = useState(false);
  const choosing = useRef(false);
  // Vrai d'« Ouvrir » jusqu'à l'affichage du fichier choisi : le fichier courant du FileStore peut déjà
  // être le nouveau, alors que le document affiché est encore l'ancien (T1.6).
  const opening = useRef(false);
  /** Y.Doc restauré au lancement avec son fichier : sa sauvegarde automatique commence en pause (PL3). */
  const pausedAtStart = useRef<Y.Doc | null>(null);

  /** Retient un signe de travail commencé (H1, critère 6) ; il reste vrai jusqu'au lancement suivant. */
  const noteActivity = useCallback((sign: keyof LaunchActivity) => {
    setActivity((current) => (current[sign] ? current : { ...current, [sign]: true }));
  }, []);

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

  /**
   * Enregistrement lancé par la sauvegarde automatique (T1.6). Seulement si le document a déjà un
   * fichier réécrit sur place (critères 4 et 7) et des modifications : jamais de sélecteur.
   */
  const autoSaver = useAutoSave(
    document?.ydoc,
    async () => {
      if (opening.current) return "busy";
      if (!document || pending || document.fileName === null || !store.canSaveInPlace()) {
        return "done";
      }
      if (!hasUnsavedChanges(document)) return "done";
      return save(false, true);
    },
    (ydoc) => pausedAtStart.current === ydoc,
  );

  // Au chargement, le dernier document modifié est restauré depuis sa copie de secours (T0d, critère 4).
  useEffect(() => {
    let cancelled = false;
    const id = backups.lastModifiedId();
    void (async () => {
      const restored = id ? restoredDocument(id, await backups.read(id)) : null;
      // PL3 : le document reprend le fichier où il était enregistré, sans rien y écrire pour l'instant.
      const file = restored ? await store.restore(restored.id) : null;
      if (cancelled) return;
      if (!restored) {
        setDocument(createNewDocument());
        return;
      }
      // INVARIANT (PL3, critère 4) : le fichier retrouvé n'est réécrit qu'après un enregistrement choisi
      // par l'utilisateur, qui a vu son nom ; jusque-là, la sauvegarde automatique attend.
      if (file) pausedAtStart.current = restored.ydoc;
      setDocument(file ? { ...restored, fileName: file.name } : restored);
      noteActivity("restoredFromBackup");
      setMessage(recoveredMessage(file));
    })();
    return () => {
      cancelled = true;
    };
  }, [backups, store, noteActivity]);

  /** Demande confirmation avant d'abandonner des modifications non enregistrées (critère 1). */
  function canDiscard(): boolean {
    return !unsaved || window.confirm(DISCARD_QUESTION);
  }

  /** Affiche un autre document. INVARIANT : sa copie de secours est absente, identique ou effacée. */
  function show(next: OpenDocument) {
    // Rien de l'ancien document ne doit plus être écrit, même avant que React ait affiché le nouveau (T1.6).
    autoSaver.current?.dispose();
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
    // Pendant une écriture, « Nouveau » attend : la fin de l'écriture reprendrait le fichier oublié (lot B).
    if (saving.current || !canDiscard()) return;
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
      // L'ancien document est abandonné : le fichier courant est déjà celui qu'on ouvre (T1.6).
      autoSaver.current?.dispose();
      noteActivity("backupQuestion");
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
    // Pendant une écriture, « Ouvrir » attend : la fin d'un « Enregistrer sous » changerait le fichier
    // courant après l'ouverture, et le document ouvert s'écrirait dans l'ancien fichier (lot B).
    if (saving.current || opening.current || !canDiscard()) return;
    // Compte dès l'ouverture du sélecteur, même si l'utilisateur annule (H1, critère 6).
    noteActivity("fileAction");
    opening.current = true;
    // Rien n'est écrit pendant l'ouverture : le fichier courant peut changer avant le document affiché.
    const held = autoSaver.current;
    held?.hold();
    try {
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
        // PL3 : le fichier ouvert est retenu pour le prochain lancement, sous l'id du document.
        await store.remember((opened as OpenDocument).id);
        await showOpenedFile(opened);
      } else if (error) {
        setMessage({ kind: "alert", icon: "unreadable", text: error });
      }
    } finally {
      opening.current = false;
      // Sans effet si l'ancien document a été remplacé (son AutoSaver est arrêté).
      held?.release();
    }
  }

  /**
   * Enregistre le document affiché. Un seul enregistrement à la fois, manuel ou automatique (T1.6, critère 6).
   * INVARIANT : rien n'est écrit pendant « Ouvrir » ni pendant la question de la copie de secours :
   * le fichier courant du FileStore peut alors être celui qu'on ouvre, et non celui du document affiché.
   * @param auto vrai pour la sauvegarde automatique : une réussite ne change pas le message affiché
   * @returns `busy` si un autre enregistrement ou une ouverture est en cours, sinon `done`
   */
  async function save(asNew: boolean, auto = false): Promise<"done" | "busy"> {
    if (!document) return "done";
    if (saving.current || opening.current || pending) return "busy";
    saving.current = true;
    setWriting(true);
    // Le résultat est signalé à la sauvegarde automatique de ce document, même s'il est remplacé entre-temps.
    const saver = autoSaver.current;
    // Un sélecteur d'enregistrement ouvert ne doit pas disparaître dans un rechargement (H1).
    noteActivity("fileAction");
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
        saver?.reportResult("saved");
        // PL3 : un nouveau fichier est retenu pour le prochain lancement. « Enregistrer » sans fichier
        // ouvre aussi le sélecteur.
        if (asNew || saved.fileName === null) await store.remember(saved.id);
      }
      // Après un échec, la sauvegarde automatique attend un enregistrement réussi (critère 5).
      const failed = result.status === "failed" || result.status === "conflict";
      if (failed) saver?.reportResult("failed");
      if (result.status !== "cancelled" && (!auto || failed)) {
        setMessage(saveMessage(result));
      }
    } finally {
      saving.current = false;
      setWriting(false);
    }
    return "done";
  }

  useSaveShortcut(() => void save(false));

  // Pas d'indicateur pour une page vide sans fichier : « Enregistré » ferait croire qu'un fichier existe
  // (décision du product owner à la relecture de U1b). Dès la première frappe, il passe à « Non enregistré ».
  const blank = document !== null && document.fileName === null && !unsaved;
  const saveState: SaveState | null = writing
    ? "saving"
    : unsaved
      ? "unsaved"
      : blank
        ? null
        : "saved";

  return {
    document,
    unsaved,
    saveState,
    backupLinked,
    message,
    pending,
    activity,
    /** À appeler à chaque modification faite par l'utilisateur dans l'éditeur (H1, critère 6). */
    noteEdit: () => noteActivity("edited"),
    recover: () => void resolvePending(true),
    openAsIs: () => void resolvePending(false),
    /** Ferme le message affiché (U1b, critère 4). */
    dismissMessage: () => setMessage(null),
    newDocument,
    open: () => void open(),
    save: () => void save(false),
    saveAs: () => void save(true),
  };
}
