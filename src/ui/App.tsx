// Composant racine : en-tête, messages, question de la copie de secours, éditeur du document affiché
// et pied de page. Mise en page selon la charte docs/design/README.md (U1a).
import { AppHeader } from "./AppHeader";
import { BackupChoice } from "./BackupChoice";
import { DocumentEditor } from "./DocumentEditor";
import { useAppUpdate } from "./useAppUpdate";
import { useDocumentFile } from "./useDocumentFile";
import "./fonts";
import "./styles.css";

/** Composant racine de l'application. */
export function App() {
  const {
    document,
    backupLinked,
    message,
    pending,
    activity,
    noteEdit,
    recover,
    openAsIs,
    ...file
  } = useDocumentFile();
  // Une nouvelle version s'applique au démarrage si rien n'est commencé (H1).
  useAppUpdate(activity, document !== null);
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
        <AppHeader fileName={null} actions={null} />
      </div>
    );
  }
  return (
    <div className="nano-app">
      <AppHeader fileName={document.fileName} actions={actions} />
      {message && (
        <p role={message.kind} className={`nano-message nano-message-${message.kind}`}>
          {message.text}
        </p>
      )}
      {pending ? (
        // L'éditeur est masqué tant que l'utilisateur n'a pas choisi (T0d, critère 8).
        <BackupChoice
          key={pending.backup.guid}
          fileName={pending.file.fileName}
          recover={recover}
          openAsIs={openAsIs}
        />
      ) : (
        // Une clé par Y.Doc : « Nouveau » et « Ouvrir » recréent l'éditeur (T0c, critère 10).
        <DocumentEditor key={document.ydoc.guid} ydoc={document.ydoc} onEdit={noteEdit} />
      )}
      <footer className="nano-footer">
        <span>{backupLinked ? "Copie de secours à jour" : ""}</span>
        <span>Fonctionne hors ligne</span>
      </footer>
    </div>
  );
}
