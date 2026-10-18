// Zone d'édition d'un document (T0b) : barre d'outils et éditeur Tiptap relié à un Y.Doc.
// La configuration vient de src/editor/ ; ce composant ne fait que l'afficher.
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useState } from "react";
import * as Y from "yjs";
import { exposeDocumentForTests } from "../editor/devTestHook";
import { createEditorOptions } from "../editor/editorOptions";
import { Toolbar } from "./Toolbar";

/** Éditeur d'un document neuf. T0c lui fournira le Y.Doc d'un fichier ouvert. */
export function DocumentEditor() {
  // INVARIANT : un Y.Doc neuf par document, jamais réutilisé pour un autre (voir CLAUDE.md).
  const [ydoc] = useState(() => new Y.Doc());
  const editor = useEditor({ ...createEditorOptions(ydoc), autofocus: true }, [ydoc]);

  useEffect(() => {
    exposeDocumentForTests(ydoc);
  }, [ydoc]);

  return (
    <div className="nano-document">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
