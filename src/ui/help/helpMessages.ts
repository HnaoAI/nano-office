// Messages de l'application cités par l'aide (A1, critère 4), découpés de helpContent.ts.
// INVARIANT : chaque phrase vient de la même constante que l'application, jamais d'une copie.
import { CORRUPTED_FILE_MESSAGE, PARSE_ERROR_MESSAGES } from "../../core/documentFile";
import { recoveredMessage, saveMessage } from "../fileMessages";

/** Nom de fichier pris en exemple dans les messages cités. */
const EXAMPLE_FILE = "Lettre.nano";

/**
 * Messages de l'application cités par l'aide, dans l'ordre du critère 3.4, avec la phrase exacte affichée
 * (critère 4). Exportés pour le test qui vérifie qu'ils viennent des mêmes constantes.
 */
export const HELP_MESSAGES = {
  recovered: recoveredMessage(null).text,
  changedElsewhere: saveMessage({ status: "conflict", name: EXAMPLE_FILE })?.text ?? "",
  permission: recoveredMessage({
    name: EXAMPLE_FILE,
    needsPermission: true,
    changedElsewhere: false,
  }).text,
  corrupted: CORRUPTED_FILE_MESSAGE,
  newerVersion: PARSE_ERROR_MESSAGES["unsupported-version"],
  saveFailed: saveMessage({ status: "failed" })?.text ?? "",
};
