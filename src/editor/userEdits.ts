// Reconnaît une modification faite par l'utilisateur dans l'éditeur (ticket H1, critère 6) : un caractère
// tapé, une mise en forme appliquée, même sans texte sélectionné. Sans React.
import type { Transaction } from "@tiptap/pm/state";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

/**
 * Vrai si la transaction vient de l'utilisateur : document modifié ou mise en forme choisie pour la
 * suite de la saisie (gras activé avant de taper).
 * Les transactions de Yjs (affichage d'un document chargé, annuler, rétablir) et celles qu'elles
 * entraînent (identifiants de bloc) ne comptent pas : elles arrivent aussi sans aucune action.
 */
export function isUserEdit(transaction: Transaction): boolean {
  const origin =
    (transaction.getMeta("appendedTransaction") as Transaction | undefined) ?? transaction;
  if (origin.getMeta(ySyncPluginKey) !== undefined) return false;
  return transaction.docChanged || transaction.storedMarksSet;
}
