// Indicateur d'enregistrement de l'en-tête (U1b), selon la maquette Messages.dc.html :
// « Enregistré » (point plein), « Enregistrement… » (point creux), « Non enregistré » (pastille noire).
import type { SaveState } from "./documentState";

const LABELS: Record<SaveState, string> = {
  saved: "Enregistré",
  saving: "Enregistrement…",
  unsaved: "Non enregistré",
};

/**
 * Pastille de l'état d'enregistrement du document affiché.
 * Pas de rôle `status` : il change à chaque frappe, et les messages de l'application gardent ce rôle.
 * @param state état fourni par `useDocumentFile`
 */
export function SaveIndicator({ state }: { state: SaveState }) {
  return (
    <span className={`nano-save-state nano-save-state-${state}`}>
      <span className="nano-save-dot" aria-hidden="true" />
      {LABELS[state]}
    </span>
  );
}
