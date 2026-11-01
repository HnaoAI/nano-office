// Fichier lu par « Ouvrir » (T0c), en texte pour un document `.nano`, en octets pour un fichier Word (T2.18).
import { isWordFileName } from "../core/wordFiles";

/**
 * Fichier lu par « Ouvrir » : son nom et son texte (UTF-8). Un fichier Word (T2.18) est lu en octets dans `bytes`,
 * avec un texte vide ; il ne devient jamais le fichier courant.
 */
export interface OpenedFile {
  name: string;
  text: string;
  bytes?: Uint8Array;
}

/** Lit un fichier choisi : en octets si son nom est celui d'un fichier Word (T2.18), sinon en texte. */
export async function readOpenedFile(name: string, blob: Blob): Promise<OpenedFile> {
  if (isWordFileName(name))
    return { name, text: "", bytes: new Uint8Array(await blob.arrayBuffer()) };
  return { name, text: await blob.text() };
}
