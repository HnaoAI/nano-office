// Composant racine : boutons de fichier, messages, question de la copie de secours et éditeur du document affiché.
import { BackupChoice } from "./BackupChoice";
import { DocumentEditor } from "./DocumentEditor";
import { FileMenu } from "./FileMenu";
import { useDocumentFile } from "./useDocumentFile";
import "./styles.css";

/** Composant racine de l'application. */
export function App() {
  const { document, message, pending, recover, openAsIs, newDocument, open, save, saveAs } =
    useDocumentFile();
  // Pendant la lecture de la copie de secours, rien n'est modifiable (T0d, critère 4).
  if (!document) {
    return (
      <main className="nano-app">
        <h1>Nano Office</h1>
      </main>
    );
  }
  return (
    <main className="nano-app">
      <h1>Nano Office</h1>
      <FileMenu newDocument={newDocument} open={open} save={save} saveAs={saveAs} />
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
        <DocumentEditor key={document.ydoc.guid} ydoc={document.ydoc} />
      )}
    </main>
  );
}
