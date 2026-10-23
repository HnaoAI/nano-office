// Composant racine : en-tête, messages, question de la copie de secours, éditeur du document affiché,
// boîtes « Mise en page » (T2.5) et « Réglages » (T3.1), fenêtre et message de mise à jour (H3), et pied de page. Mise en page selon la charte docs/design/README.md (U1a).
// L'en-tête, le message et la barre de mise en forme restent en haut de la fenêtre (M1, `useStickyTop`).
import { useCallback, useState } from "react";
import { AppHeader } from "./AppHeader";
import { BackupChoice } from "./BackupChoice";
import { DocumentEditor } from "./DocumentEditor";
import { MessageBar } from "./MessageBar";
import { PageSetupDialog } from "./PageSetupDialog";
import { SettingsDialog } from "./SettingsDialog";
import { UpdateDialog } from "./UpdateDialog";
import { UpdateNotice } from "./UpdateNotice";
import { useAssistantSettings } from "./useAssistantSettings";
import { usePageSetupDialog } from "./usePageSetupDialog";
import { useAppUpdate } from "./useAppUpdate";
import { useDocumentFile } from "./useDocumentFile";
import { usePrintShortcut } from "./usePrintShortcut";
import { useStickyTop } from "./useStickyTop";
import { useWordExport } from "./useWordExport";
import "./fonts";
// Ordre des feuilles : les variables d'abord, puis la mise en page, avant les composants qui la précisent.
import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/toolbar.css";
import "./styles/pickers.css";
import "./styles/tables.css";
import "./styles/images.css";
import "./styles/search.css";
import "./styles/messages.css";
import "./styles/dialog.css";
import "./styles/assistant.css";
import "./styles/update.css";
import "./styles/print.css";

/**
 * Ouvre la boîte d'impression du navigateur, qui propose aussi « Enregistrer au format PDF » (T2.6).
 * N'écrit rien dans le document : imprimer n'est pas une modification (critère 7).
 */
function print() {
  window.print();
}

/** Composant racine de l'application. */
export function App() {
  const {
    document,
    backupLinked,
    message,
    saveState,
    dismissMessage,
    imageRejected,
    showMessage,
    pending,
    activity,
    reloadKeepsDocument,
    noteEdit,
    noteFileAction,
    recover,
    openAsIs,
    ...file
  } = useDocumentFile();
  // Une nouvelle version s'applique au démarrage si rien n'est commencé (H1), et si le rechargement
  // rouvre le même document (H2).
  // H3 : pendant la fenêtre « se met à jour », le reste de la page est inerte.
  const update = useAppUpdate(activity, document !== null, reloadKeepsDocument);
  usePrintShortcut(print);
  const exportWord = useWordExport(document, showMessage, noteFileAction);
  const pageDialog = usePageSetupDialog(document?.ydoc ?? null, noteEdit, noteFileAction);
  // Réglages de l'assistant (T3.1), gardés sur cet ordinateur, communs à tous les documents.
  const assistant = useAssistantSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  // Partie figée (M1) : la barre de mise en forme et la recherche de l'éditeur s'affichent dans
  // `editorTools`, sous le message, pour rester en haut avec l'en-tête.
  const { topRef, toolsRef, coveredTop } = useStickyTop();
  const [editorTools, setEditorTools] = useState<HTMLDivElement | null>(null);
  const actions = {
    newDocument: file.newDocument,
    open: file.open,
    save: file.save,
    saveAs: file.saveAs,
    print,
    exportWord,
  };
  // Pendant la lecture de la copie de secours, rien n'est modifiable (T0d, critère 4) : l'en-tête
  // s'affiche seul, sans groupe Fichier ni indicateur.
  return (
    <>
      <div className="nano-app" inert={update.updating}>
        <div className="nano-top" ref={topRef}>
          <AppHeader
            fileName={document?.fileName ?? null}
            saveState={saveState}
            actions={document ? actions : null}
            onSettings={document ? () => setSettingsOpen(true) : undefined}
          />
          <div className="nano-top-tools" ref={toolsRef}>
            {update.notice && <UpdateNotice text={update.notice} onClose={update.dismissNotice} />}
            {document && message && (
              <MessageBar
                message={message}
                onAction={(action) => (action === "save-as" ? file.saveAs() : file.save())}
                onClose={dismissMessage}
              />
            )}
            <div ref={setEditorTools} />
          </div>
        </div>
        {document && (
          <>
            {pending ? (
              // L'éditeur est masqué tant que l'utilisateur n'a pas choisi (T0d, critère 8) ; une page estompée
              // le remplace, sous la boîte de dialogue (U1b, critère 5).
              <BackupChoice
                key={pending.backup.guid}
                fileName={pending.file.fileName}
                recover={recover}
                openAsIs={openAsIs}
              />
            ) : (
              // Une clé par Y.Doc : « Nouveau » et « Ouvrir » recréent l'éditeur (T0c, critère 10).
              <DocumentEditor
                key={document.ydoc.guid}
                ydoc={document.ydoc}
                onEdit={noteEdit}
                onImageRejected={imageRejected}
                onPageSetup={pageDialog.show}
                assistant={assistant.config}
                tools={editorTools}
                coveredTop={coveredTop}
              />
            )}
            {pageDialog.current && !pending && (
              <PageSetupDialog
                current={pageDialog.current}
                onApply={pageDialog.apply}
                onCancel={pageDialog.close}
              />
            )}
            {settingsOpen && !pending && (
              <SettingsDialog
                settings={assistant.settings}
                keys={assistant.keys}
                onSave={(settings, keys) => {
                  assistant.save(settings, keys);
                  closeSettings();
                }}
                onForgetKeys={assistant.forgetKeys}
                onCancel={closeSettings}
              />
            )}
            <footer className="nano-footer">
              <span>{backupLinked ? "Copie de secours à jour" : ""}</span>
              <span>Fonctionne hors ligne</span>
            </footer>
          </>
        )}
      </div>
      {update.updating && <UpdateDialog />}
    </>
  );
}
