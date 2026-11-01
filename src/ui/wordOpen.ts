// Ouverture d'un fichier Word (T2.18), chargée à la demande par useDocumentFile.ts : la lecture de Word (JSZip)
// ne ralentit pas le démarrage. Relie la conversion pure (src/core/wordImport.ts) au navigateur : analyse du XML
// par DOMParser, images réduites comme au lot D (src/editor/imageImport.ts). Rien ne passe par le réseau (critère 5).
import {
  readWordFile,
  WORD_ERROR_MESSAGES,
  wordDocument,
  wordOpenNotice,
} from "../core/wordImport";
import type { StoredImage } from "../core/images";
import type { OpenDocument } from "../core/types";
import { prepareImage } from "../editor/imageImport";

/** Analyse un fichier XML de l'archive avec le DOMParser du navigateur. */
function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml");
}

/**
 * Lit un fichier Word et en fait un nouveau document (critère 1). Ne lève jamais d'exception.
 * @param name nom du fichier Word
 * @param bytes contenu du fichier, lu sans être modifié
 * @returns le document et le message à afficher (ce qui n'a pas été repris), ou le message d'un refus (critère 4)
 */
export async function openWordFile(
  name: string,
  bytes: Uint8Array,
): Promise<{ ok: true; document: OpenDocument; notice: string } | { ok: false; message: string }> {
  try {
    const result = await readWordFile(bytes, parseXml);
    if (!result.ok) return { ok: false, message: WORD_ERROR_MESSAGES[result.error] };
    const { conversion } = result;
    const prepared = new Map<string, StoredImage | null>();
    // Une image à la fois : une archive de 50 photos ne décode pas toutes ses images en même temps.
    for (const [key, data] of conversion.images) {
      const image = await prepareImage(new Blob([data as BlobPart]));
      prepared.set(key, image.ok ? image.image : null);
    }
    const { document, skipped } = wordDocument(conversion, prepared, name);
    return { ok: true, document, notice: wordOpenNotice(name, skipped, conversion.trackedChanges) };
  } catch {
    return { ok: false, message: WORD_ERROR_MESSAGES.damaged };
  }
}
