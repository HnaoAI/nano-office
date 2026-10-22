// En-tête de l'application (U1a) : logo, nom et version (H1), nom du document et du fichier,
// indicateur d'enregistrement (U1b), groupe Fichier, bouton « Réglages » (T3.1).
import { documentTitle } from "../core/documentFile";
import { APP_VERSION } from "./appVersion";
import { FileMenu, type FileMenuActions } from "./FileMenu";
import { GearIcon } from "./icons";
import { SaveIndicator } from "./SaveIndicator";
import type { SaveState } from "./documentState";

/**
 * En-tête de l'application.
 * @param fileName nom du fichier du document affiché, null s'il n'a jamais été enregistré
 * @param saveState état de l'indicateur d'enregistrement (U1b), null pour ne pas l'afficher
 * @param actions boutons du groupe Fichier ; absents, avec l'indicateur, pendant le chargement de la copie de secours
 * @param onSettings ouvre la boîte « Réglages » (T3.1, critère 1), au bout de l'en-tête
 */
export function AppHeader({
  fileName,
  saveState,
  actions,
  onSettings,
}: {
  fileName: string | null;
  saveState: SaveState | null;
  actions: FileMenuActions | null;
  onSettings?: () => void;
}) {
  return (
    <header className="nano-header">
      <div className="nano-brand">
        <span className="nano-logo" aria-hidden="true">
          N
        </span>
        <div className="nano-app-name">
          {/* Seul titre de la page : les tests de T0c cliquent dessus pour sortir de l'éditeur. */}
          <h1>Nano Buro</h1>
          <span className="nano-version" title={`Version de Nano Buro : ${APP_VERSION}`}>
            {APP_VERSION}
          </span>
        </div>
      </div>
      {actions && (
        <>
          <div className="nano-header-divider" aria-hidden="true" />
          <div className="nano-document-name">
            <span className="nano-document-title">{documentTitle(fileName)}</span>
            {fileName && <span className="nano-file-name">{fileName}</span>}
          </div>
          <div className="nano-header-spacer" />
          {saveState && <SaveIndicator state={saveState} />}
          <FileMenu {...actions} />
          {onSettings && (
            <button
              type="button"
              className="nano-settings-button"
              aria-label="Réglages"
              title="Réglages"
              onClick={onSettings}
            >
              <GearIcon />
            </button>
          )}
        </>
      )}
    </header>
  );
}
