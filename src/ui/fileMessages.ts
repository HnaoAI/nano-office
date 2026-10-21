// Messages affichés sous l'en-tête par `useDocumentFile` (T0c, T0d, U1b), ceux d'un fichier
// retrouvé au lancement (PL3) et ceux d'une image refusée (T1.9). Textes seulement : l'affichage est dans MessageBar.tsx.
import type { ImageRejection } from "../editor/imageImport";
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
/** Fin des alertes « modifié ailleurs » : texte validé par le PO à la relecture du lot B. */
const KEEP_BOTH =
  "« Enregistrer sous… » garde les deux versions ; « Enregistrer » remplace l'autre.";
const SAVE_ERROR =
  "Le document n'a pas pu être enregistré. Réessayez, ou choisissez un autre emplacement avec « Enregistrer sous… ».";

/**
 * Message d'un document restauré depuis la copie de secours au lancement (T0d, critère 4).
 * PL3 : s'il a retrouvé son fichier, le message nomme ce fichier (critère 4) et propose de l'enregistrer,
 * ou de redonner l'autorisation d'y écrire (critère 2). Si le fichier a été modifié ailleurs pendant la
 * fermeture, une alerte propose « Enregistrer sous… » (relecture de PL3).
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
  if (file.changedElsewhere) {
    // Relecture de PL3 : une version plus récente, venue de l'autre ordinateur, ne doit pas être écrasée sans prévenir.
    return {
      kind: "alert",
      icon: "save-failed",
      text: `Ce document a été récupéré depuis la copie de secours de ce navigateur, mais le fichier « ${file.name} » a été modifié ailleurs depuis, peut-être sur un autre ordinateur. ${KEEP_BOTH}`,
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
      text: `Le fichier « ${result.name} » a été modifié ailleurs, peut-être sur un autre ordinateur. Pour ne pas l'écraser, l'enregistrement automatique est arrêté. ${KEEP_BOTH}`,
      action: "save-as",
    };
  }
  return result.status === "failed"
    ? { kind: "alert", icon: "save-failed", text: SAVE_ERROR, action: "save-as" }
    : null;
}

/** Textes d'une image refusée (T1.9, critère 2). */
const IMAGE_REJECTED: Record<ImageRejection, string> = {
  "too-large":
    "Cette image pèse plus de 25 Mo : elle n'a pas été ajoutée. Choisissez une image plus légère.",
  unsupported: "Ce fichier n'est pas une image JPEG, PNG, WebP ou GIF : il n'a pas été ajouté.",
  unreadable:
    "Cette image n'a pas pu être lue, le fichier est peut-être abîmé : elle n'a pas été ajoutée.",
};

/** Message d'une image refusée à l'insertion (T1.9, critère 2). Le document n'a pas changé. */
export function imageRejectedMessage(reason: ImageRejection): FileMessage {
  return { kind: "alert", icon: "unreadable", text: IMAGE_REJECTED[reason] };
}
