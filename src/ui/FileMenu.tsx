// Boutons de fichier (T0c) : Nouveau, Ouvrir…, Enregistrer, Enregistrer sous…
import { MOD } from "./shortcuts";

/** Actions déclenchées par les boutons. */
export interface FileMenuActions {
  newDocument: () => void;
  open: () => void;
  save: () => void;
  saveAs: () => void;
}

/**
 * Barre des actions sur les fichiers. Les boutons gardent le curseur dans l'éditeur.
 * @param actions actions fournies par `useDocumentFile`
 */
export function FileMenu({ newDocument, open, save, saveAs }: FileMenuActions) {
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();
  return (
    <div className="nano-toolbar" role="toolbar" aria-label="Fichier">
      <button type="button" onMouseDown={keepFocus} onClick={newDocument}>
        Nouveau
      </button>
      <button type="button" onMouseDown={keepFocus} onClick={open}>
        Ouvrir…
      </button>
      <button type="button" title={`Enregistrer (${MOD}+S)`} onMouseDown={keepFocus} onClick={save}>
        Enregistrer
      </button>
      <button type="button" onMouseDown={keepFocus} onClick={saveAs}>
        Enregistrer sous…
      </button>
    </div>
  );
}
