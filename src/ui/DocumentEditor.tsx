// Zone d'édition d'un document (T0b) : barre de mise en forme, barre de recherche (T2.1), panneau de
// l'assistant (T3.1) et éditeur Tiptap relié à un Y.Doc, affiché comme une page blanche centrée (U1a),
// au format et aux marges du document (T2.5), avec ses repères de page et le compteur « Page 3 sur 7 »
// du pied de page (T2.8), à côté du compteur de mots (T2.11), et panneau « Plan » à gauche de la page (T2.9).
// La barre de mise en forme, le panneau de l'assistant et la recherche s'affichent dans la partie
// figée de App (M1).
// La configuration vient de src/editor/ ; ce composant ne fait que l'afficher.
import { EditorContent, useEditor } from "@tiptap/react";
import type { EditorEvents } from "@tiptap/core";
import { useEffect, useEffectEvent, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type * as Y from "yjs";
import { exposeDocumentForTests } from "../editor/devTestHook";
import { focusEditor } from "../editor/focus";
import { createEditorOptions } from "../editor/editorOptions";
import { scrollBelowStickyTop } from "../editor/stickyScroll";
import type { ImageRejection } from "../editor/imageImport";
import { isUserEdit } from "../editor/userEdits";
import { pageCounterText } from "../core/pageBreaks";
import { pageSize, printPageRule, type PageSetup } from "../core/pageSetup";
import { loadOutlineOpen, saveOutlineOpen } from "../storage/outlinePreference";
import { AssistantPanel } from "./AssistantPanel";
import { OutlinePanel } from "./OutlinePanel";
import { PageMarksLayer } from "./PageMarksLayer";
import { SearchBar, type SearchRequest } from "./SearchBar";
import { Toolbar } from "./Toolbar";
import { useAssistant } from "./useAssistant";
import { useOutline } from "./useOutline";
import type { AssistantConfig } from "./useAssistantSettings";
import { usePageLayout } from "./usePageLayout";
import { usePageSetup } from "./usePageSetup";
import { useSearchShortcuts } from "./useSearchShortcuts";
import { useWordCount } from "./useWordCount";
import { WordCounter } from "./WordCounter";
import { LinkBubble } from "./LinkBubble";

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
 * @param tools emplacement de la barre de mise en forme, du panneau de l'assistant et de la recherche, dans la partie figée en
 *   haut de la fenêtre (M1) ; null avant son affichage
 * @param coveredTop hauteur cachée par la partie figée, pour que le curseur n'y passe jamais (M1,
 *   critère B) ; fonction stable
 * @param coveredBottom hauteur cachée par le pied de page figé (T2.8) ; fonction stable
 * @param counter emplacement du compteur « Page 3 sur 7 » dans le pied de page (T2.8, critère 5) ; null
 *   avant son affichage
 */
export function DocumentEditor({
  ydoc,
  onEdit,
  onImageRejected,
  onPageSetup,
  assistant,
  tools,
  coveredTop,
  coveredBottom,
  counter,
}: {
  ydoc: Y.Doc;
  onEdit: () => void;
  onImageRejected: (reasons: ImageRejection[]) => void;
  onPageSetup: () => void;
  assistant: AssistantConfig | null;
  tools: HTMLElement | null;
  coveredTop: () => number;
  coveredBottom: () => number;
  counter: HTMLElement | null;
}) {
  // Une seule configuration par Y.Doc : elle porte la bibliothèque d'images du document (T1.9).
  // `onImageRejected`, `coveredTop` et `coveredBottom` sont stables, ils ne recréent pas la configuration.
  const options = useMemo(() => {
    const base = createEditorOptions(ydoc, onImageRejected);
    return {
      ...base,
      editorProps: { ...base.editorProps, ...scrollBelowStickyTop(coveredTop, coveredBottom) },
    };
  }, [ydoc, onImageRejected, coveredTop, coveredBottom]);
  // Focus au démarrage, curseur au début du document (sélection initiale de Tiptap). Pas `autofocus` :
  // Tiptap y remet la sélection au début une image plus tard (requestAnimationFrame), même si
  // l'utilisateur a déjà cliqué ou appuyé sur Fin entre-temps : sa frappe partait alors au début
  // (test instable H2, critère 2, Issue #102). Ici, rien ne bouge si l'éditeur a déjà le focus.
  const editor = useEditor(
    { ...options, onCreate: ({ editor: created }) => focusEditor(created) },
    [ydoc],
  );
  const pageSetup = usePageSetup(ydoc);
  const [sheet, setSheet] = useState<HTMLElement | null>(null);
  const marks = usePageLayout(editor, sheet, pageSetup);
  // Plan (T2.9) : fermé par défaut, choix retenu sur cet ordinateur (critère 1).
  const [outlineOpen, setOutlineOpen] = useState(loadOutlineOpen);
  const showOutline = (open: boolean) => {
    setOutlineOpen(open);
    saveOutlineOpen(open);
  };
  const outline = useOutline(editor, outlineOpen, marks.layout);
  const words = useWordCount(editor);

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

  const toolbar = (
    <>
      <div className="nano-format-row">
        <Toolbar
          editor={editor}
          onPageSetup={onPageSetup}
          outline={{ open: outlineOpen, onToggle: () => showOutline(!outlineOpen) }}
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
      {/* Le panneau reste visible avec la barre : on lance l'assistant n'importe où dans la page (M1). */}
      {assistant && (
        <AssistantPanel
          editor={editor}
          status={helper.status}
          onCancel={helper.cancel}
          onDismiss={helper.dismiss}
          coveredTop={coveredTop}
        />
      )}
      {search && <SearchBar editor={editor} request={search} onClose={() => setSearch(null)} />}
    </>
  );

  return (
    <>
      {tools && createPortal(toolbar, tools)}
      {counter &&
        createPortal(
          <>
            <span className="nano-page-counter">
              {pageCounterText(marks.current, marks.layout.pageCount)}
            </span>
            <WordCounter count={words} pages={marks.layout.pageCount} />
          </>,
          counter,
        )}
      {/* Format de la feuille imprimée : A4, orientation et marges du document (T2.6, critère 3). */}
      <style>{printPageRule(pageSetup)}</style>
      {outlineOpen && (
        <OutlinePanel
          editor={editor}
          outline={outline}
          coveredTop={coveredTop}
          onClose={() => showOutline(false)}
        />
      )}
      <main className={outlineOpen ? "nano-workspace nano-outline-open" : "nano-workspace"}>
        <article
          ref={setSheet}
          className="nano-page"
          data-orientation={pageSetup.orientation}
          style={pageStyle(pageSetup)}
        >
          <EditorContent editor={editor} />
          <LinkBubble editor={editor} />
          <PageMarksLayer starts={marks.layout.starts} offset={marks.offset} />
        </article>
      </main>
    </>
  );
}
