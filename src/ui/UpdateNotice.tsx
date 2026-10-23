// Message « Nano Buro a été mis à jour (v…) » affiché après le rechargement de mise à jour (H3, critère 6),
// au style d'un message d'information (messages.css). Il s'ajoute au message du document restauré, qui
// revient à l'identique (critère 9) : c'est pourquoi il n'a ni la classe `nano-message`, ni le rôle `status`.
import { CheckIcon, CloseIcon } from "./icons";

/**
 * Message d'information de la mise à jour.
 * @param text texte du message (`updatedNotice`)
 * @param onClose ferme le message
 */
export function UpdateNotice({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="nano-update-notice">
      <span className="nano-message-icon" aria-hidden="true">
        <CheckIcon />
      </span>
      <p className="nano-message-text" aria-live="polite">
        {text}
      </p>
      <button
        type="button"
        className="nano-message-close"
        aria-label="Fermer l'information de mise à jour"
        title="Fermer"
        onClick={onClose}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
