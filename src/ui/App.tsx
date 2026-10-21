// Composant racine : en-tête, messages, question de la copie de secours, éditeur du document affiché
// et pied de page. Mise en page selon la charte docs/design/README.md (U1a).
import { AppHeader } from "./AppHeader";
import { BackupChoice } from "./BackupChoice";
import { DocumentEditor } from "./DocumentEditor";
import { MessageBar } from "./MessageBar";
import { useAppUpdate } from "./useAppUpdate";
import { useDocumentFile } from "./useDocumentFile";
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

/** Composant racine de l'application. */
export function App() {
  const {
    document,
    backupLinked,
    message,
    saveState,
    dismissMessage,
    imageRejected,
    pending,
    activity,
    reloadKeepsDocument,
    noteEdit,
    recover,
    openAsIs,
    ...file
  } = useDocumentFile();
  // Une nouvelle version s'applique au démarrage si rien n'est commencé (H1), et si le rechargement
  // rouvre le même document (H2).
  useAppUpdate(activity, document !== null, reloadKeepsDocument);
  const actions = {
    newDocument: file.newDocument,
    open: file.open,
    save: file.save,
    saveAs: file.saveAs,
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
        />
      )}
      <footer className="nano-footer">
        <span>{backupLinked ? "Copie de secours à jour" : ""}</span>
        <span>Fonctionne hors ligne</span>
      </footer>
    </div>
  );
}
