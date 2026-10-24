// Configuration de l'éditeur Tiptap de Nano Buro (T0b) : schéma partagé, identifiants de bloc,
// et extension de collaboration qui range le contenu dans un Y.Doc. Sans React.
import type { EditorOptions } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import type * as Y from "yjs";
import { ImageNode } from "../core/imageSchema";
import { PAGE_SETUP_ORIGIN } from "../core/pageSetup";
import { documentExtensions, YJS_FRAGMENT_NAME } from "../core/schema";
import { BlockIdGenerator } from "./blockIds";
import { CleanClipboard } from "./clipboard";
import type { ImageRejectedHandler } from "./imageInsert";
import { createImageExtensions } from "./images";
import { FormatShortcuts } from "./keyboardShortcuts";
import { PageBreaks } from "./pageBreak";
import { createPageSetupHistory } from "./pageSetup";
import { Search } from "./search";
import { Suggestions } from "./suggestions";
import { TableNavigation } from "./tables";

/**
 * Options de l'éditeur pour un document donné.
 *
 * - Le schéma vient de `documentExtensions`, sans redéfinition : un fichier enregistré correspond
 *   toujours à ce que l'éditeur affiche (T0b, critère 5).
 * - L'extension de collaboration remplace l'historique de Tiptap : Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z et
 *   Ctrl/Cmd+Y passent par le gestionnaire d'annulation de Yjs (critère 4).
 * - Aucune mise en forme automatique : `**texte**` ou un collage Markdown restent du texte
 *   (règle produit 6, critère 8) : `# ` ne crée pas de titre (T1.1, critère 9).
 * - Les raccourcis de mise en forme sont reconnus à la touche physique (`FormatShortcuts`).
 * - Le copier-coller garde la structure et retire la mise en forme d'origine (`CleanClipboard`, T1.5).
 * - On peut toujours écrire avant ou après un tableau (`TableNavigation`, T1.8) et après un saut de page
 *   (`PageBreaks`, T2.8).
 * - Les images sont affichées depuis le Y.Doc, insérées par le bouton, un dépôt ou un collage (T1.9) :
 *   le nœud image du schéma est remplacé par sa version reliée au document, à la même place.
 * - La recherche surligne ses occurrences par des décorations, hors du document (`Search`, T2.1).
 * - Les corrections de l'assistant s'affichent par des décorations, hors du document (`Suggestions`, T3.1).
 * - Un changement de mise en page s'annule avec Ctrl/Cmd+Z, comme une modification du texte (T2.5).
 * - Le correcteur orthographique du navigateur est activé (critère 7).
 *
 * @param ydoc document Yjs qui contient le texte ; il doit être neuf ou déjà rempli par Yjs,
 *   jamais complété par `setContent` (voir l'INVARIANT de CLAUDE.md)
 * @param onImageRejected affiche le message d'une image refusée (T1.9, critère 2)
 */
export function createEditorOptions(
  ydoc: Y.Doc,
  onImageRejected: ImageRejectedHandler = () => undefined,
): Partial<EditorOptions> {
  const images = createImageExtensions(ydoc, onImageRejected);
  return {
    extensions: [
      ...documentExtensions.map((extension) => (extension === ImageNode ? images.node : extension)),
      images.plugin,
      BlockIdGenerator,
      FormatShortcuts,
      CleanClipboard,
      TableNavigation,
      PageBreaks,
      Search,
      Suggestions,
      Collaboration.configure({
        document: ydoc,
        field: YJS_FRAGMENT_NAME,
        yUndoOptions: { trackedOrigins: [PAGE_SETUP_ORIGIN] },
      }),
      createPageSetupHistory(ydoc),
    ],
    enableInputRules: false,
    enablePasteRules: false,
    editorProps: {
      attributes: {
        spellcheck: "true",
        lang: "fr",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Document",
        class: "nano-editor",
      },
    },
  };
}
