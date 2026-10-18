// Composant racine : boutons de fichier, messages et éditeur du document affiché.
import { DocumentEditor } from "./DocumentEditor";
import { FileMenu } from "./FileMenu";
import { useDocumentFile } from "./useDocumentFile";
import "./styles.css";

/** Composant racine de l'application. */
export function App() {
  const { document, message, ...actions } = useDocumentFile();
  return (
    <main className="nano-app">
      <h1>Nano Office</h1>
      <FileMenu {...actions} />
      {message && (
        <p role={message.kind} className={`nano-message nano-message-${message.kind}`}>
          {message.text}
        </p>
      )}
      {/* Une clé par Y.Doc : « Nouveau » et « Ouvrir » recréent l'éditeur (T0c, critère 10). */}
      <DocumentEditor key={document.ydoc.guid} ydoc={document.ydoc} />
    </main>
  );
}
