// Hook React de l'export en Word (T2.7) : prépare le contenu, les images et les polices du document
// affiché, le convertit (src/core/wordExport.ts) et l'écrit par src/storage/exportStore.ts.
// Le document et son fichier `.nano` ne sont jamais modifiés (critère 1).
import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { contentOf } from "../core/fileFormat";
import { readHeaderFooter } from "../core/headerFooter";
import { readPageSetup } from "../core/pageSetup";
import type { OpenDocument } from "../core/types";
import { exportFile } from "../storage/exportStore";
import { tocPagesOf } from "./tocPages";
import { wordExportMessage, type FileMessage } from "./fileMessages";

/**
 * Action « Exporter en Word… » du document affiché.
 * @param document document affiché, ou null pendant le chargement
 * @param showMessage affiche le résultat (fichier créé, téléchargé ou erreur)
 * @param onStart appelé au clic : l'export compte comme travail commencé (H1), pour qu'une mise à jour
 *   ne recharge pas la page pendant que le sélecteur est ouvert
 * @returns la fonction à appeler au clic ; un second clic pendant un export est ignoré
 */
export function useWordExport(
  document: OpenDocument | null,
  showMessage: Dispatch<SetStateAction<FileMessage | null>>,
  onStart: () => void,
) {
  const running = useRef(false);
  return useCallback(() => {
    if (!document || running.current) return;
    running.current = true;
    onStart();
    void (async () => {
      try {
        // Chargés au premier export seulement : la bibliothèque docx ne ralentit pas le démarrage.
        // Le fichier est dans le cache de l'application, l'export marche hors ligne.
        const [
          { DOCX_MIME, exportWord, usedFonts, wordFileName },
          { loadWordFonts, loadWordImages },
        ] = await Promise.all([import("../core/wordExport"), import("./wordAssets")]);
        const { ydoc, fileName } = document;
        const content = contentOf(ydoc);
        const [images, fonts] = await Promise.all([
          loadWordImages(ydoc, content),
          loadWordFonts(usedFonts(content)),
        ]);
        const data = await exportWord({
          content,
          pageSetup: readPageSetup(ydoc),
          headerFooter: readHeaderFooter(ydoc),
          tocPages: tocPagesOf(ydoc),
          images,
          fonts,
        });
        const result = await exportFile({
          suggestedName: wordFileName(fileName),
          data,
          mime: DOCX_MIME,
          extension: ".docx",
          description: "Document Word",
        });
        const message = wordExportMessage(result, fileName);
        // Une alerte déjà affichée (fichier modifié ailleurs, échec d'enregistrement…) reste visible :
        // elle porte une action, le message de réussite n'en porte pas.
        if (message) {
          showMessage((current) =>
            current?.kind === "alert" && message.kind === "status" ? current : message,
          );
        }
      } catch {
        showMessage(wordExportMessage({ status: "failed" }, document.fileName));
      } finally {
        running.current = false;
      }
    })();
  }, [document, showMessage, onStart]);
}
