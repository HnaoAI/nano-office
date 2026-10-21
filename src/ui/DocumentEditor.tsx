// Zone d'édition d'un document (T0b) : barre de mise en forme et éditeur Tiptap relié à un Y.Doc,
// affiché comme une page blanche centrée (U1a).
// La configuration vient de src/editor/ ; ce composant ne fait que l'afficher.
import { EditorContent, useEditor } from "@tiptap/react";
import type { EditorEvents } from "@tiptap/core";
import { useEffect, useEffectEvent, useMemo } from "react";
import type * as Y from "yjs";
import { exposeDocumentForTests } from "../editor/devTestHook";
import { createEditorOptions } from "../editor/editorOptions";
import type { ImageRejection } from "../editor/imageImport";
import { isUserEdit } from "../editor/userEdits";
import { Toolbar } from "./Toolbar";

/**
 * Éditeur d'un document.
 * INVARIANT : l'extension de collaboration se lie au Y.Doc à la création de l'éditeur. Le parent
 * recrée ce composant (attribut `key`) pour chaque nouveau Y.Doc, avec un historique d'annulation vide (T0c).
 * @param ydoc document Yjs neuf ou lu depuis un fichier, jamais réutilisé pour un autre document
 * @param onEdit appelé à chaque caractère tapé ou mise en forme appliquée (H1, critère 6)
 * @param onImageRejected affiche le message d'une image refusée (T1.9, critère 2) ; fonction stable
 */
export function DocumentEditor({
  ydoc,
  onEdit,
  onImageRejected,
}: {
  ydoc: Y.Doc;
  onEdit: () => void;
  onImageRejected: (reason: ImageRejection) => void;
}) {
  // Une seule configuration par Y.Doc : elle porte la bibliothèque d'images du document (T1.9).
  // `onImageRejected` est stable (useDocumentFile), il ne recrée pas la configuration.
  const options = useMemo(
    () => createEditorOptions(ydoc, onImageRejected),
    [ydoc, onImageRejected],
  );
  const editor = useEditor({ ...options, autofocus: true }, [ydoc]);

  const onTransaction = useEffectEvent(({ transaction }: EditorEvents["transaction"]) => {
    if (isUserEdit(transaction)) onEdit();
  });
  useEffect(() => {
    editor.on("transaction", onTransaction);
    return () => {
      editor.off("transaction", onTransaction);
    };
  }, [editor]);

  useEffect(() => {
    exposeDocumentForTests(ydoc);
  }, [ydoc]);

  return (
    <>
      <div className="nano-format-row">
        <Toolbar editor={editor} />
      </div>
      <main className="nano-workspace">
        <article className="nano-page">
          <EditorContent editor={editor} />
        </article>
      </main>
    </>
  );
}
