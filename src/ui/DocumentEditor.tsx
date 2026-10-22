// Zone d'édition d'un document (T0b) : barre de mise en forme, barre de recherche (T2.1), panneau de
// l'assistant (T3.1) et éditeur Tiptap relié à un Y.Doc, affiché comme une page blanche centrée (U1a),
// au format et aux marges du document (T2.5).
// La configuration vient de src/editor/ ; ce composant ne fait que l'afficher.
import { EditorContent, useEditor } from "@tiptap/react";
import type { EditorEvents } from "@tiptap/core";
import { useEffect, useEffectEvent, useMemo, useState, type CSSProperties } from "react";
import type * as Y from "yjs";
import { exposeDocumentForTests } from "../editor/devTestHook";
import { createEditorOptions } from "../editor/editorOptions";
import type { ImageRejection } from "../editor/imageImport";
import { isUserEdit } from "../editor/userEdits";
import { pageSize, printPageRule, type PageSetup } from "../core/pageSetup";
import { AssistantPanel } from "./AssistantPanel";
import { SearchBar, type SearchRequest } from "./SearchBar";
import { Toolbar } from "./Toolbar";
import { useAssistant } from "./useAssistant";
import type { AssistantConfig } from "./useAssistantSettings";
import { usePageSetup } from "./usePageSetup";
import { useSearchShortcuts } from "./useSearchShortcuts";

/** Variables CSS de la page (layout.css) : feuille A4 et marges du document, en centimètres (T2.5). */
function pageStyle(setup: PageSetup): CSSProperties {
  const size = pageSize(setup.orientation);
  const { top, right, bottom, left } = setup.margins;
  return {
    "--page-width": `${size.width}cm`,
    "--page-height": `${size.height}cm`,
    "--page-margin-top": `${top}cm`,
    "--page-margin-right": `${right}cm`,
    "--page-margin-bottom": `${bottom}cm`,
    "--page-margin-left": `${left}cm`,
  } as CSSProperties;
}

/**
 * Éditeur d'un document.
 * INVARIANT : l'extension de collaboration se lie au Y.Doc à la création de l'éditeur. Le parent
 * recrée ce composant (attribut `key`) pour chaque nouveau Y.Doc, avec un historique d'annulation vide (T0c).
 * @param ydoc document Yjs neuf ou lu depuis un fichier, jamais réutilisé pour un autre document
 * @param onEdit appelé à chaque caractère tapé ou mise en forme appliquée (H1, critère 6)
 * @param onImageRejected affiche le message d'une image refusée (T1.9, critère 2) ; fonction stable
 * @param onPageSetup ouvre la boîte « Mise en page » (T2.5)
 * @param assistant fournisseur, modèle et clé de l'assistant (T3.1) ; null quand il est éteint : ni
 *   bouton, ni panneau, ni requête (critère 4)
 */
export function DocumentEditor({
  ydoc,
  onEdit,
  onImageRejected,
  onPageSetup,
  assistant,
}: {
  ydoc: Y.Doc;
  onEdit: () => void;
  onImageRejected: (reasons: ImageRejection[]) => void;
  onPageSetup: () => void;
  assistant: AssistantConfig | null;
}) {
  // Une seule configuration par Y.Doc : elle porte la bibliothèque d'images du document (T1.9).
  // `onImageRejected` est stable (useDocumentFile), il ne recrée pas la configuration.
  const options = useMemo(
    () => createEditorOptions(ydoc, onImageRejected),
    [ydoc, onImageRejected],
  );
  const editor = useEditor({ ...options, autofocus: true }, [ydoc]);
  const pageSetup = usePageSetup(ydoc);

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

  const helper = useAssistant(editor, assistant);

  return (
    <>
      <div className="nano-format-row">
        <Toolbar
          editor={editor}
          onPageSetup={onPageSetup}
          assistant={
            assistant
              ? {
                  online: helper.online,
                  pending: helper.status.kind === "pending",
                  onRun: (task) => void helper.run(task),
                }
              : null
          }
        />
      </div>
      {assistant && (
        <AssistantPanel
          editor={editor}
          status={helper.status}
          onCancel={helper.cancel}
          onDismiss={helper.dismiss}
        />
      )}
      {search && <SearchBar editor={editor} request={search} onClose={() => setSearch(null)} />}
      {/* Format de la feuille imprimée : A4, orientation et marges du document (T2.6, critère 3). */}
      <style>{printPageRule(pageSetup)}</style>
      <main className="nano-workspace">
        <article
          className="nano-page"
          data-orientation={pageSetup.orientation}
          style={pageStyle(pageSetup)}
        >
          <EditorContent editor={editor} />
        </article>
      </main>
    </>
  );
}
