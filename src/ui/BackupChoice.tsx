// Question posée quand un fichier ouvert diffère de sa copie de secours (T0d, critère 8).
import { useState } from "react";

/** Question affichée à la place de l'éditeur. */
export const BACKUP_QUESTION =
  "Ce fichier a des modifications non enregistrées, gardées dans la copie de secours.";

/** Choix possibles, fournis par `useDocumentFile`. */
export interface BackupChoiceActions {
  recover: () => void;
  openAsIs: () => void;
}

/**
 * Demande s'il faut récupérer la copie de secours ou ouvrir le fichier tel quel.
 * Tant que rien n'est choisi, la copie reste intacte (critère 11). Un seul choix est pris en compte.
 * @param fileName nom du fichier ouvert
 */
export function BackupChoice({
  fileName,
  recover,
  openAsIs,
}: BackupChoiceActions & { fileName: string | null }) {
  const [chosen, setChosen] = useState(false);
  const choose = (action: () => void) => () => {
    setChosen(true);
    action();
  };
  return (
    <div className="nano-choice" role="alertdialog" aria-labelledby="nano-choice-question">
      <p id="nano-choice-question">
        {fileName && <strong>{fileName} : </strong>}
        {BACKUP_QUESTION}
      </p>
      <div className="nano-toolbar">
        <button type="button" disabled={chosen} onClick={choose(recover)} autoFocus>
          Récupérer les modifications non enregistrées
        </button>
        <button type="button" disabled={chosen} onClick={choose(openAsIs)}>
          Ouvrir le fichier tel quel
        </button>
      </div>
    </div>
  );
}
