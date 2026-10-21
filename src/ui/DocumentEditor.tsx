// Zone d'édition d'un document (T0b) : barre de mise en forme, barre de recherche (T2.1) et éditeur
// Tiptap relié à un Y.Doc, affiché comme une page blanche centrée (U1a).
// La configuration vient de src/editor/ ; ce composant ne fait que l'afficher.
import { EditorContent, useEditor } from "@tiptap/react";
import type { EditorEvents } from "@tiptap/core";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import type * as Y from "yjs";
import { exposeDocumentForTests } from "../editor/devTestHook";
import { createEditorOptions } from "../editor/editorOptions";
import type { ImageRejection } from "../editor/imageImport";
import { isUserEdit } from "../editor/userEdits";
import { SearchBar, type SearchRequest } from "./SearchBar";
import { Toolbar } from "./Toolbar";
import { useSearchShortcuts } from "./useSearchShortcuts";

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
  onImageRejected: (reasons: ImageRejection[]) => void;
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

  // Barre de recherche (T2.1) : chaque raccourci crée une demande, avec le texte sélectionné s'il
  // tient dans un seul paragraphe.
  const [search, setSearch] = useState<SearchRequest | null>(null);
  useSearchShortcuts((mode) => {
    const { from, to, empty, $from, $to } = editor.state.selection;
    const seed = !empty && $from.sameParent($to) ? editor.state.doc.textBetween(from, to) : null;
    setSearch((previous) => ({ id: (previous?.id ?? 0) + 1, mode, seed }));
  });

  return (
    <>
      <div className="nano-format-row">
        <Toolbar editor={editor} />
      </div>
      {search && <SearchBar editor={editor} request={search} onClose={() => setSearch(null)} />}
      <main className="nano-workspace">
        <article className="nano-page">
          <EditorContent editor={editor} />
        </article>
      </main>
    </>
  );
}
