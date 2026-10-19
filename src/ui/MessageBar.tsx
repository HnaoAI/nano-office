// Message de l'application sous l'en-tête (U1b), selon la maquette Messages.dc.html :
// information sur fond blanc, alerte sur fond noir, puce d'icône, action à droite et bouton de fermeture.
import type { ReactNode } from "react";
import { CloseIcon, DownloadIcon, FileAlertIcon, RecoveredIcon, WarningIcon } from "./icons";
import type { FileMessage } from "./useDocumentFile";

const ICONS: Record<FileMessage["icon"], () => ReactNode> = {
  recovered: RecoveredIcon,
  downloaded: DownloadIcon,
  unreadable: FileAlertIcon,
  "save-failed": WarningIcon,
};

/**
 * Affiche un message. Le rôle `status` ou `alert` est porté par le texte seul, pour que le nom lu
 * et vérifié par les tests reste le texte du message, sans les boutons (U1b, critère 7).
 * @param message message fourni par `useDocumentFile`
 * @param onSaveAs action « Enregistrer sous… », proposée si `message.offersSaveAs`
 * @param onClose ferme le message
 */
export function MessageBar({
  message,
  onSaveAs,
  onClose,
}: {
  message: FileMessage;
  onSaveAs: () => void;
  onClose: () => void;
}) {
  const MessageIcon = ICONS[message.icon];
  return (
    <div className={`nano-message nano-message-${message.kind}`}>
      <span className="nano-message-icon" aria-hidden="true">
        <MessageIcon />
      </span>
      <p role={message.kind} className="nano-message-text">
        {message.text}
      </p>
      {message.offersSaveAs && (
        <button type="button" className="nano-message-action" onClick={onSaveAs}>
          Enregistrer sous…
        </button>
      )}
      <button
        type="button"
        className="nano-message-close"
        aria-label="Fermer le message"
        title="Fermer le message"
        onClick={onClose}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
