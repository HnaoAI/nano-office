// Composant racine : en-tête, messages, question de la copie de secours, éditeur du document affiché,
// boîte « Mise en page » (T2.5) et pied de page. Mise en page selon la charte docs/design/README.md (U1a).
import { AppHeader } from "./AppHeader";
import { BackupChoice } from "./BackupChoice";
import { DocumentEditor } from "./DocumentEditor";
import { MessageBar } from "./MessageBar";
import { PageSetupDialog } from "./PageSetupDialog";
import { usePageSetupDialog } from "./usePageSetupDialog";
import { useAppUpdate } from "./useAppUpdate";
import { useDocumentFile } from "./useDocumentFile";
import { usePrintShortcut } from "./usePrintShortcut";
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
  useAppUpdate(activity, document !== null, reloadKeepsDocument);
  usePrintShortcut(print);
  const exportWord = useWordExport(document, showMessage, noteFileAction);
  const pageDialog = usePageSetupDialog(document?.ydoc ?? null, noteEdit, noteFileAction);
  const actions = {
    newDocument: file.newDocument,
    open: file.open,
    save: file.save,
    saveAs: file.saveAs,
    print,
    exportWord,
  };
  // Pendant la lecture de la copie de secours, rien n'est modifiable (T0d, critère 4).
  if (!document) {
    return (
      <div className="nano-app">
        <AppHeader fileName={null} saveState={saveState} actions={null} />
      </div>
    );
  }
  return (
    <div className="nano-app">
      <AppHeader fileName={document.fileName} saveState={saveState} actions={actions} />
      {message && (
        <MessageBar
          message={message}
          onAction={(action) => (action === "save-as" ? file.saveAs() : file.save())}
          onClose={dismissMessage}
        />
      )}
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
        />
      )}
      {pageDialog.current && !pending && (
        <PageSetupDialog
          current={pageDialog.current}
          onApply={pageDialog.apply}
          onCancel={pageDialog.close}
        />
      )}
      <footer className="nano-footer">
        <span>{backupLinked ? "Copie de secours à jour" : ""}</span>
        <span>Fonctionne hors ligne</span>
      </footer>
    </div>
  );
}
