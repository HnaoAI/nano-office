// Composant racine : titre de l'application et éditeur d'un document neuf.
import { DocumentEditor } from "./DocumentEditor";
import "./styles.css";

/** Composant racine de l'application. */
export function App() {
  return (
    <main className="nano-app">
      <h1>Nano Office</h1>
      <DocumentEditor />
    </main>
  );
}
