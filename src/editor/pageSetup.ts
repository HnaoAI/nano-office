// Mise en page (T2.5) dans l'historique d'annulation de l'éditeur : la `Y.Map` « page » du Y.Doc est
// ajoutée au gestionnaire d'annulation de Yjs, pour que Ctrl/Cmd+Z annule un changement en une fois.
// Dépend de Tiptap et de @tiptap/y-tiptap ; la logique de la mise en page est dans src/core/pageSetup.ts.
import { Extension } from "@tiptap/core";
import { yUndoPluginKey } from "@tiptap/y-tiptap";
import type * as Y from "yjs";
import { PAGE_MAP_NAME, PAGE_SETUP_ORIGIN } from "../core/pageSetup";

/**
 * Extension qui relie la mise en page d'un Y.Doc à l'historique de l'éditeur (critère 5).
 * - La `Y.Map` « page » entre dans le champ du gestionnaire d'annulation ; les changements d'origine
 *   `PAGE_SETUP_ORIGIN` y sont suivis (voir `yUndoOptions` dans `editorOptions.ts`).
 * - Chaque changement est isolé (`stopCapturing`) : il ne se fond pas avec la frappe qui précède ou suit.
 * - Après un changement ou son annulation, une transaction vide redessine la barre (Annuler, Rétablir).
 * @param ydoc document de l'éditeur
 */
export function createPageSetupHistory(ydoc: Y.Doc) {
  const map = ydoc.getMap(PAGE_MAP_NAME);
  return Extension.create({
    name: "pageSetupHistory",
    onCreate() {
      const undoManager = yUndoPluginKey.getState(this.editor.state)?.undoManager as
        Y.UndoManager | undefined;
      if (!undoManager) return;
      undoManager.addToScope(map);
      const editor = this.editor;
      const before = (transaction: Y.Transaction) => {
        if (transaction.origin === PAGE_SETUP_ORIGIN) undoManager.stopCapturing();
      };
      const after = (transaction: Y.Transaction) => {
        if (transaction.origin === PAGE_SETUP_ORIGIN) undoManager.stopCapturing();
        // Les types de Yjs n'acceptent pas une Y.Map comme clé de `changed` (événement plus précis).
        if (!transaction.changed.has(map as unknown as Y.AbstractType<Y.YEvent<Y.Map<unknown>>>))
          return;
        // Hors de la transaction Yjs : l'éditeur ne doit pas écrire pendant qu'elle se termine.
        queueMicrotask(() => {
          if (!editor.isDestroyed)
            editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false));
        });
      };
      ydoc.on("beforeTransaction", before);
      ydoc.on("afterTransaction", after);
      this.storage.detach = () => {
        ydoc.off("beforeTransaction", before);
        ydoc.off("afterTransaction", after);
      };
    },
    addStorage() {
      return { detach: () => undefined } as { detach: () => void };
    },
    onDestroy() {
      this.storage.detach();
    },
  });
}
