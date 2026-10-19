// Groupe Fichier de l'en-tête (T0c, style U1a) : Nouveau, Ouvrir…, Enregistrer sous…, Enregistrer.
import { MOD, SAVE_SHORTCUT } from "./shortcuts";

/** Actions déclenchées par les boutons. */
export interface FileMenuActions {
  newDocument: () => void;
  open: () => void;
  save: () => void;
  saveAs: () => void;
}

/**
 * Groupe des actions sur les fichiers. Les boutons gardent le curseur dans l'éditeur.
 * « Enregistrer » est le bouton principal ; son raccourci est masqué aux lecteurs d'écran pour que
 * son nom accessible reste « Enregistrer » (U1a, critère 7).
 * @param actions actions fournies par `useDocumentFile`
 */
export function FileMenu({ newDocument, open, save, saveAs }: FileMenuActions) {
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();
  return (
    <div className="nano-file-menu" role="toolbar" aria-label="Fichier">
      <button type="button" onMouseDown={keepFocus} onClick={newDocument}>
        Nouveau
      </button>
      <button type="button" onMouseDown={keepFocus} onClick={open}>
        Ouvrir…
      </button>
      <button type="button" onMouseDown={keepFocus} onClick={saveAs}>
        Enregistrer sous…
      </button>
      <button
        type="button"
        className="nano-primary"
        title={`Enregistrer (${MOD}+S)`}
        onMouseDown={keepFocus}
        onClick={save}
      >
        Enregistrer
        <span className="nano-shortcut" aria-hidden="true">
          {SAVE_SHORTCUT}
        </span>
      </button>
    </div>
  );
}
