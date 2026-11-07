// Configuration de l'éditeur Tiptap de Nano Buro (T0b) : schéma partagé, identifiants de bloc,
// et extension de collaboration qui range le contenu dans un Y.Doc. Sans React.
import type { EditorOptions } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import type * as Y from "yjs";
import { ImageNode } from "../core/imageSchema";
import { PAGE_SETUP_ORIGIN } from "../core/pageSetup";
import { documentExtensions, YJS_FRAGMENT_NAME } from "../core/schema";
import { TableOfContentsNode } from "../core/tocSchema";
import { DiagramNode } from "../core/diagramSchema";
import { createDiagramNode, type DiagramEditorMount } from "./diagram";
import { BlockIdGenerator } from "./blockIds";
import { CleanClipboard } from "./clipboard";
import type { ImageRejectedHandler } from "./imageInsert";
import { createImageExtensions } from "./images";
import { FormatPainter } from "./formatPainter";
import { FormatShortcuts } from "./keyboardShortcuts";
import { LinkClick } from "./links";
import { CalloutKeys } from "./callout";
import { PageBreaks } from "./pageBreak";
import { createPageSetupHistory } from "./pageSetup";
import { Search } from "./search";
import { SheetGaps } from "./sheetGaps";
import { Suggestions } from "./suggestions";
import { TableNavigation } from "./tables";
import { TableOfContentsEditorNode } from "./toc";

/** Signale dans la console un contenu du Y.Doc que le schéma ne connaît pas, gardé tel quel (P1). */
function reportInvalidContent(error: Error): void {
  console.warn("Contenu inconnu de cette version, gardé sans modification :", error.message);
}

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
 * - Entrée sur une ligne vide en fin d'encadré en sort (`CalloutKeys`, T2.19).
 * - Le sommaire affiche ses lignes, mises à jour avec les titres (`TableOfContentsEditorNode`, T2.17) :
 *   le nœud du schéma est remplacé par sa version avec sa vue, à la même place.
 * - Un schéma s'affiche en dessin SVG et s'ouvre en modification au double clic, avec l'éditeur de formes
 *   fourni par l'interface (`createDiagramNode`, T2.20).
 * - Le pinceau copie la mise en forme du curseur vers une sélection faite à la souris (`FormatPainter`, PL4).
 * - Les espaces entre feuilles séparées sont des décorations, hors du document (`SheetGaps`, PL6).
 * - Un lien s'ouvre par Ctrl/Cmd+clic ; un clic simple place le curseur (`LinkClick`, T2.12).
 * - Un contenu du Y.Doc inconnu du schéma n'est jamais effacé (`onInvalidContent`, P1).
 * - Le correcteur orthographique du navigateur est activé (critère 7).
 *
 * @param ydoc document Yjs qui contient le texte ; il doit être neuf ou déjà rempli par Yjs,
 *   jamais complété par `setContent` (voir l'INVARIANT de CLAUDE.md)
 * @param onImageRejected affiche le message d'une image refusée (T1.9, critère 2)
 * @param diagramMount éditeur de formes des schémas (T2.20), chargé à la demande par l'interface
 */
export function createEditorOptions(
  ydoc: Y.Doc,
  onImageRejected: ImageRejectedHandler = () => undefined,
  diagramMount: DiagramEditorMount | null = null,
): Partial<EditorOptions> {
  const images = createImageExtensions(ydoc, onImageRejected);
  const diagram = createDiagramNode(diagramMount);
  return {
    extensions: [
      ...documentExtensions.map((extension) =>
        extension === ImageNode
          ? images.node
          : extension === TableOfContentsNode
            ? TableOfContentsEditorNode
            : extension === DiagramNode
              ? diagram
              : extension,
      ),
      images.plugin,
      BlockIdGenerator,
      FormatShortcuts,
      LinkClick,
      CalloutKeys,
      CleanClipboard,
      TableNavigation,
      PageBreaks,
      Search,
      Suggestions,
      FormatPainter,
      SheetGaps,
      Collaboration.configure({
        document: ydoc,
        field: YJS_FRAGMENT_NAME,
        yUndoOptions: { trackedOrigins: [PAGE_SETUP_ORIGIN] },
        // INVARIANT (P1, règle produit 3) : un contenu du Y.Doc que le schéma ne connaît pas (copie de secours
        // faite par une version plus récente) n'est jamais effacé. Sans ce rappel, @tiptap/y-tiptap 3.1.0 et
        // suivantes le suppriment du Y.Doc, donc de la copie de secours. Avec lui, comme en 3.0.10, il reste dans
        // le Y.Doc et l'éditeur refuse les modifications tant qu'il est là.
        ySyncOptions: { onInvalidContent: reportInvalidContent },
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
