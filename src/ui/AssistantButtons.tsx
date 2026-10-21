// Groupe « Assistant » de la barre de mise en forme (T3.1, critère 5) : « Corriger » et « Traduire
// en anglais ». Affiché seulement quand l'assistant est en marche (critère 4).
import type { AssistantTask } from "../core/assistant";

/**
 * Boutons de l'assistant, grisés sans sélection, hors ligne ou pendant une demande (critère 5).
 * @param hasSelection vrai si la sélection contient du texte (une image seule ne compte pas)
 * @param online vrai si le navigateur est en ligne
 * @param pending vrai pendant une demande ; Échap l'annule
 * @param onRun lance une demande, sur un clic seulement (critère 13)
 */
export function AssistantButtons({
  hasSelection,
  online,
  pending,
  onRun,
}: {
  hasSelection: boolean;
  online: boolean;
  pending: boolean;
  onRun: (task: AssistantTask) => void;
}) {
  const disabled = !hasSelection || !online || pending;
  const reason = pending
    ? "Demande en cours (Échap pour annuler)"
    : !online
      ? "Pas de connexion à internet"
      : !hasSelection
        ? "Sélectionnez d'abord du texte"
        : null;
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();
  return (
    <div className="nano-assistant-group" role="group" aria-label="Assistant">
      <button
        type="button"
        className="nano-text-button"
        disabled={disabled}
        title={reason ?? "Corriger l'orthographe, la grammaire et la ponctuation de la sélection"}
        onMouseDown={keepFocus}
        onClick={() => onRun("correct")}
      >
        Corriger
      </button>
      <button
        type="button"
        className="nano-text-button"
        disabled={disabled}
        title={reason ?? "Traduire la sélection en anglais"}
        onMouseDown={keepFocus}
        onClick={() => onRun("translate")}
      >
        Traduire en anglais
      </button>
    </div>
  );
}
