// Configuration de l'éditeur Tiptap de Nano Buro (T0b) : schéma partagé, identifiants de bloc,
// et extension de collaboration qui range le contenu dans un Y.Doc. Sans React.
import type { EditorOptions } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import type * as Y from "yjs";
import { documentExtensions, YJS_FRAGMENT_NAME } from "../core/schema";
import { BlockIdGenerator } from "./blockIds";
import { FormatShortcuts } from "./keyboardShortcuts";

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
 * - Le correcteur orthographique du navigateur est activé (critère 7).
 *
 * @param ydoc document Yjs qui contient le texte ; il doit être neuf ou déjà rempli par Yjs,
 *   jamais complété par `setContent` (voir l'INVARIANT de CLAUDE.md)
 */
export function createEditorOptions(ydoc: Y.Doc): Partial<EditorOptions> {
  return {
    extensions: [
      ...documentExtensions,
      BlockIdGenerator,
      FormatShortcuts,
      Collaboration.configure({ document: ydoc, field: YJS_FRAGMENT_NAME }),
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
