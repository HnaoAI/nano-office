// Point d'entrée de l'éditeur de formes chargé à la demande (T2.20, critère 11) : monte DiagramEditor
// (React Flow) dans le bloc du schéma, dans sa propre racine React.
import { createRoot } from "react-dom/client";
import type { DiagramEditing } from "../../editor/diagram";
import { DiagramEditor } from "./DiagramEditor";

/**
 * Affiche l'éditeur de formes dans `host`, le focus sur le schéma pour le clavier (critère 13).
 * @returns démontage
 */
export function renderDiagramEditor(host: HTMLElement, editing: DiagramEditing): () => void {
  const root = createRoot(host);
  root.render(<DiagramEditor editing={editing} />);
  requestAnimationFrame(() => host.querySelector<HTMLElement>(".react-flow__pane")?.focus());
  return () => root.unmount();
}
