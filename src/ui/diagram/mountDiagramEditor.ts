// Ouverture d'un schéma en modification (T2.20) : monte l'éditeur de formes, chargé à la demande au
// premier schéma ouvert (critère 11). Ce fichier est léger : React Flow n'est importé que par
// renderDiagramEditor.tsx et ses composants, dans un fichier à part que le service worker garde, pour
// le travail hors ligne.
import type { DiagramEditorMount } from "../../editor/diagram";

/** Texte affiché pendant le chargement de l'éditeur de formes. */
export const DIAGRAM_LOADING_TEXT = "Ouverture du schéma…";

/**
 * Monte l'éditeur de formes dans le bloc du schéma. Le démontage peut arriver avant la fin du
 * chargement : l'éditeur n'est alors jamais affiché.
 */
export const mountDiagramEditor: DiagramEditorMount = (host, editing) => {
  let unmount: (() => void) | null = null;
  let cancelled = false;
  const loading = document.createElement("p");
  loading.className = "nano-diagram-loading";
  loading.textContent = DIAGRAM_LOADING_TEXT;
  host.replaceChildren(loading);
  void import("./renderDiagramEditor").then(
    ({ renderDiagramEditor }) => {
      if (cancelled) return;
      host.replaceChildren();
      unmount = renderDiagramEditor(host, editing);
    },
    () => {
      if (!cancelled) loading.textContent = "Le schéma n'a pas pu s'ouvrir. Rechargez la page.";
    },
  );
  return () => {
    cancelled = true;
    unmount?.();
    host.replaceChildren();
  };
};
