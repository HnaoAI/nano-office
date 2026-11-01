// Hook React du document affiché (T0c) : Nouveau, Ouvrir, Enregistrer, Enregistrer sous, Ctrl/Cmd+S,
// titre de la fenêtre et messages, question de la copie de secours (T0d), état de l'indicateur et
// actions des messages (U1b), sauvegarde automatique par le même verrou que « Enregistrer » (T1.6),
// espacée pour un gros fichier (T1.9), ouverture d'un fichier Word comme nouveau document (T2.18). Découpé en M1 : restauration au lancement et fichier retrouvé
// (useLaunchRestore.ts, T0d, PL3), signes de travail commencé (useLaunchActivity.ts, H1), types et
// état de l'indicateur (documentState.ts). Logique dans src/core/, fichiers et copie dans src/storage/.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { compareWithBackup, recoveredDocument } from "../core/backup";
import {
  contentSnapshot,
  createNewDocument,
  DEFAULT_FILE_NAME,
  documentTitle,
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
  imageRejectedMessage,
  saveMessage,
  wordOpenedMessage,
  wordOpeningMessage,
  type FileMessage,
} from "./fileMessages";
import type { ImageRejection } from "../editor/imageImport";
import { saveStateOf, type PendingBackup } from "./documentState";
import { useAutoSave } from "./useAutoSave";
import { useBackup } from "./useBackup";
import { useLaunchActivity } from "./useLaunchActivity";
import { useLaunchRestore } from "./useLaunchRestore";
import { useSaveShortcut } from "./useSaveShortcut";

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
  const { activity, noteActivity, noteFileAction } = useLaunchActivity();
  const saving = useRef(false);
  // Copie lisible de `saving` pour l'indicateur (U1b) ; la référence reste le seul verrou d'enregistrement.
  const [writing, setWriting] = useState(false);
  const choosing = useRef(false);
  // Vrai d'« Ouvrir » jusqu'à l'affichage du fichier choisi : le fichier courant du FileStore peut déjà
  // être le nouveau, alors que le document affiché est encore l'ancien (T1.6).
  const opening = useRef(false);
  /** Y.Doc restauré au lancement avec son fichier : sa sauvegarde automatique commence en pause (PL3). */
  const pausedAtStart = useRef<Y.Doc | null>(null);
  // Taille du dernier fichier écrit ou ouvert, pour espacer la sauvegarde automatique au-delà de 2 Mo
  // (T1.9). En caractères : le JSON est presque tout en ASCII (base64), un caractère vaut un octet.
  const savedBytes = useRef<{ ydoc: Y.Doc | null; size: number }>({ ydoc: null, size: 0 });
  // Document affiché au dernier rendu : lu après une attente (conversion d'un fichier Word, T2.18), quand les
  // valeurs de la fonction peuvent dater d'avant des modifications.
  const documentRef = useRef(document);
  documentRef.current = document;

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
    // Un document ouvert depuis Word porte le nom de ce fichier, comme dans l'en-tête (T2.18).
    const suggested = document?.suggestedName;
    const name = document?.fileName ?? (suggested ? documentTitle(suggested) : null);
    window.document.title = windowTitle(name, unsaved);
  }, [document?.fileName, document?.suggestedName, unsaved]);

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
    () => (savedBytes.current.ydoc === document?.ydoc ? savedBytes.current.size : 0),
  );

  // Au chargement, le dernier document modifié est restauré depuis sa copie de secours (T0d, critère 4).
  const pauseAtStart = useCallback((ydoc: Y.Doc) => {
    pausedAtStart.current = ydoc;
  }, []);
  useLaunchRestore(backups, store, pauseAtStart, setDocument, setMessage);

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
    // Lu dans la référence : après la conversion d'un fichier Word, les valeurs de cette fonction sont anciennes.
    const current = documentRef.current;
    if (current && hasUnsavedChanges(current) && backups.lastModifiedId() === current.id) {
      backups.setLastModifiedId(null);
    }
    setPending(null);
    setMessage(null);
    setDocument(next);
  }

  function newDocument() {
    // Pendant une écriture, « Nouveau » attend : la fin de l'écriture reprendrait le fichier oublié (lot B).
    // Pendant l'ouverture d'un fichier (conversion d'un Word comprise), « Nouveau » attend aussi (T2.18).
    if (saving.current || opening.current || !canDiscard()) return;
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
        // Un fichier Word n'est jamais retenu : il devient un nouveau document (T2.18, critère 1).
        const file = await store.open(({ name, text, bytes }) => {
          if (bytes) return false;
          const result = openDocumentText(name, text);
          if (result.ok) {
            opened = result.document;
            savedBytes.current = { ydoc: result.document.ydoc, size: text.length };
          } else error = result.message;
          return result.ok;
        });
        if (!file) return;
        if (file.bytes) {
          await openWord(file.name, file.bytes);
          return;
        }
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
   * Ouvre un fichier Word comme un nouveau document (T2.18) : un message d'attente pendant la conversion (critère 5),
   * puis ce qui n'a pas pu être repris (critère 3), ou le message d'un refus (critère 4). Le document en cours
   * n'est remplacé qu'une fois la conversion réussie, et le fichier courant est oublié : « Enregistrer » demande
   * toujours un emplacement, et n'écrit jamais dans le fichier Word (critère 1).
   */
  async function openWord(name: string, bytes: Uint8Array) {
    setMessage(wordOpeningMessage(name));
    // Le document reste modifiable pendant la conversion : ce qui y est écrit ne doit pas être perdu sans
    // confirmation, même si l'utilisateur avait accepté d'abandonner les modifications d'avant (règle produit 3).
    const before = documentRef.current;
    let edited = false;
    const onEdit = () => {
      edited = true;
    };
    before?.ydoc.on("update", onEdit);
    let result: Awaited<ReturnType<typeof import("./wordOpen").openWordFile>>;
    try {
      const { openWordFile } = await import("./wordOpen");
      result = await openWordFile(name, bytes);
    } finally {
      before?.ydoc.off("update", onEdit);
    }
    if (!result.ok) {
      setMessage({ kind: "alert", icon: "unreadable", text: result.message });
      return;
    }
    const current = documentRef.current;
    if (
      edited &&
      current === before &&
      current !== null &&
      hasUnsavedChanges(current) &&
      !window.confirm(DISCARD_QUESTION)
    ) {
      setMessage(null);
      return;
    }
    store.forget();
    show(result.document);
    setMessage(wordOpenedMessage(result.notice));
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
      // Un document ouvert depuis Word propose le nom du fichier Word en .nano (T2.18, critère 1).
      const suggested = saved.fileName ?? saved.suggestedName ?? DEFAULT_FILE_NAME;
      const result =
        asNew || (saved.fileName === null && saved.suggestedName !== undefined)
          ? await store.saveAs(text, suggested)
          : await store.save(text, { onlyIfUnchanged: auto });
      if (result.status === "saved" || result.status === "downloaded") {
        const name = result.name;
        savedBytes.current = { ydoc: saved.ydoc, size: text.length };
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

  const saveState = saveStateOf(document, unsaved, writing);

  const imageRejected = useCallback(
    (reasons: ImageRejection[]) => setMessage(imageRejectedMessage(reasons)),
    [],
  );

  return {
    document,
    unsaved,
    saveState,
    backupLinked,
    message,
    pending,
    activity,
    /**
     * Vrai si un rechargement rouvrirait le document affiché (H2) : sans modifications non enregistrées,
     * ou s'il est encore le dernier document modifié. Une autre fenêtre peut avoir changé ce dernier.
     */
    reloadKeepsDocument: () =>
      document === null || !unsaved || backups.lastModifiedId() === document.id,
    /** À appeler à chaque modification faite par l'utilisateur dans l'éditeur (H1, critère 6). */
    noteEdit: () => noteActivity("edited"),
    recover: () => void resolvePending(true),
    openAsIs: () => void resolvePending(false),
    /** Ferme le message affiché (U1b, critère 4). */
    dismissMessage: () => setMessage(null),
    /** Affiche le message d'une image refusée à l'insertion (T1.9, critère 2). */
    imageRejected,
    /** Affiche un message, par exemple le résultat d'un export en Word (T2.7). */
    showMessage: setMessage,
    /**
     * Retient une action sur un fichier hors de ce hook (export en Word, T2.7) ou une boîte ouverte
     * (« Mise en page », T2.5) : un rechargement de mise à jour la ferait disparaître (H1, critère 6).
     */
    noteFileAction,
    newDocument,
    open: () => void open(),
    save: () => void save(false),
    saveAs: () => void save(true),
  };
}
