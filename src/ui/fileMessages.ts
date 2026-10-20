// Messages affichés sous l'en-tête par `useDocumentFile` (T0c, T0d, U1b), et ceux d'un fichier
// retrouvé au lancement (PL3). Textes seulement : l'affichage est dans MessageBar.tsx.
import type { RestoredFile, SaveResult } from "../storage/fileStore";

/**
 * Action proposée à droite d'un message (U1b, critère 4) :
 * - `save-as` : « Enregistrer sous… » ;
 * - `save` : « Enregistrer », dans le fichier retrouvé au lancement (PL3) ;
 * - `allow` : « Autoriser », qui redonne l'autorisation d'écrire puis enregistre (PL3, critère 2).
 */
export type MessageAction = "save-as" | "save" | "allow";

/** Message affiché sous la barre de menus : information (`status`) ou erreur (`alert`). */
export interface FileMessage {
  kind: "status" | "alert";
  text: string;
  /** Icône de la puce, selon la maquette Messages.dc.html (U1b). */
  icon: "recovered" | "downloaded" | "unreadable" | "save-failed";
  action?: MessageAction;
}

export const DISCARD_QUESTION =
  "Les modifications non enregistrées de ce document seront perdues. Voulez-vous continuer ?";
export const READ_ERROR = "Le fichier n'a pas pu être lu. Le document en cours n'a pas changé.";
const RECOVERED = "Ce document a été récupéré depuis la copie de secours de ce navigateur.";
const SAVE_ERROR =
  "Le document n'a pas pu être enregistré. Réessayez, ou choisissez un autre emplacement avec « Enregistrer sous… ».";

/**
 * Message d'un document restauré depuis la copie de secours au lancement (T0d, critère 4).
 * PL3 : s'il a retrouvé son fichier, le message nomme ce fichier (critère 4) et propose de l'enregistrer,
 * ou de redonner l'autorisation d'y écrire (critère 2).
 * @param file fichier retrouvé, ou null
 */
export function recoveredMessage(file: RestoredFile | null): FileMessage {
  const message = { kind: "status", icon: "recovered" } as const;
  if (!file) {
    return {
      ...message,
      text: `${RECOVERED} Enregistrez-le pour le garder dans un fichier.`,
      action: "save-as",
    };
  }
  if (file.needsPermission) {
    return {
      ...message,
      text: `${RECOVERED} Pour l'enregistrer de nouveau dans « ${file.name} », autorisez Nano Buro à modifier ce fichier.`,
      action: "allow",
    };
  }
  return {
    ...message,
    text: `${RECOVERED} Enregistrez-le pour mettre à jour le fichier « ${file.name} ».`,
    action: "save",
  };
}

/** Message à afficher après un enregistrement, ou null s'il n'y a rien à dire. */
export function saveMessage(result: SaveResult): FileMessage | null {
  if (result.status === "downloaded") {
    return {
      kind: "status",
      icon: "downloaded",
      text: `Le fichier « ${result.name} » a été téléchargé dans votre dossier de téléchargements. Pour enregistrer directement dans le dossier de votre choix, utilisez Chrome ou Edge.`,
    };
  }
  if (result.status === "conflict") {
    // T1.6 (décision du PO à la relecture) : la sauvegarde automatique n'écrase pas un fichier modifié ailleurs.
    return {
      kind: "alert",
      icon: "save-failed",
      text: `Le fichier « ${result.name} » a été modifié en dehors de Nano Buro, peut-être sur un autre ordinateur. Pour ne pas l'écraser, la sauvegarde automatique est arrêtée. Choisissez un autre emplacement avec « Enregistrer sous… », ou « Enregistrer » pour le remplacer.`,
      action: "save-as",
    };
  }
  return result.status === "failed"
    ? { kind: "alert", icon: "save-failed", text: SAVE_ERROR, action: "save-as" }
    : null;
}
