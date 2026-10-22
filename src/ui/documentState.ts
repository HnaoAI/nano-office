// État du document affiché par l'interface : indicateur d'enregistrement (U1b) et fichier en attente
// de la question de la copie de secours (T0d). Découpé de useDocumentFile.ts (M1), sans changement.
import type * as Y from "yjs";
import type { OpenDocument } from "../core/types";

/** État affiché par l'indicateur d'enregistrement de l'en-tête (U1b, critère 2). */
export type SaveState = "saved" | "saving" | "unsaved";

/** Fichier ouvert dont la copie de secours diffère, en attente du choix de l'utilisateur (T0d, critère 8). */
export interface PendingBackup {
  file: OpenDocument;
  backup: Y.Doc;
}

/**
 * État de l'indicateur d'enregistrement.
 * @param document document affiché, null pendant la lecture de la copie de secours
 * @param unsaved vrai si le document a des modifications non enregistrées
 * @param writing vrai pendant une écriture
 * @returns null pour ne pas afficher l'indicateur
 */
export function saveStateOf(
  document: OpenDocument | null,
  unsaved: boolean,
  writing: boolean,
): SaveState | null {
  // Pas d'indicateur pour une page vide sans fichier : « Enregistré » ferait croire qu'un fichier existe
  // (décision du product owner à la relecture de U1b). Dès la première frappe, il passe à « Non enregistré ».
  const blank = document !== null && document.fileName === null && !unsaved;
  return writing ? "saving" : unsaved ? "unsaved" : blank ? null : "saved";
}
