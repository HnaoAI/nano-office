// Question posée quand un fichier ouvert diffère de sa copie de secours (T0d, critère 8), en boîte de
// dialogue centrée au-dessus de la page estompée, selon la maquette Recuperation.dc.html (U1b, critère 5).
import { useState } from "react";
import { BackupIcon, FileIcon } from "./icons";

/** Question affichée dans la boîte de dialogue. */
export const BACKUP_QUESTION =
  "Ce fichier a des modifications non enregistrées, gardées dans la copie de secours de ce navigateur.";

/** Choix possibles, fournis par `useDocumentFile`. */
export interface BackupChoiceActions {
  recover: () => void;
  openAsIs: () => void;
}

/**
 * Demande s'il faut récupérer la copie de secours ou ouvrir le fichier tel quel.
 * Tant que rien n'est choisi, la copie reste intacte (critère 11). Un seul choix est pris en compte.
 * La page derrière est un simple dessin (`aria-hidden`) : l'éditeur n'existe pas avant le choix (critère 8).
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
    <>
      <div className="nano-workspace">
        <div className="nano-page nano-page-faded" aria-hidden="true" />
      </div>
      <div className="nano-dialog-layer">
        <div className="nano-dialog-backdrop" aria-hidden="true" />
        <section
          className="nano-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="nano-choice-title"
          aria-describedby="nano-choice-question"
        >
          <span className="nano-dialog-icon" aria-hidden="true">
            <BackupIcon />
          </span>
          <div className="nano-dialog-text">
            <h2 id="nano-choice-title">Modifications non enregistrées</h2>
            <p id="nano-choice-question">{BACKUP_QUESTION}</p>
          </div>
          {fileName && (
            <div className="nano-dialog-file">
              <FileIcon />
              <span>{fileName}</span>
            </div>
          )}
          <div className="nano-dialog-buttons">
            <button
              type="button"
              className="nano-dialog-primary"
              disabled={chosen}
              onClick={choose(recover)}
              autoFocus
            >
              Récupérer les modifications non enregistrées
            </button>
            <button type="button" disabled={chosen} onClick={choose(openAsIs)}>
              Ouvrir le fichier tel quel
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
