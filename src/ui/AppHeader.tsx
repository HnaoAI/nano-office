// En-tête de l'application (U1a) : logo, nom et version (H1), nom du document et du fichier, groupe Fichier.
// L'indicateur d'enregistrement, avant le groupe Fichier, viendra avec U1b.
import { documentTitle } from "../core/documentFile";
import { APP_VERSION } from "./appVersion";
import { FileMenu, type FileMenuActions } from "./FileMenu";

/**
 * En-tête de l'application.
 * @param fileName nom du fichier du document affiché, null s'il n'a jamais été enregistré
 * @param actions boutons du groupe Fichier ; absents pendant le chargement de la copie de secours
 */
export function AppHeader({
  fileName,
  actions,
}: {
  fileName: string | null;
  actions: FileMenuActions | null;
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
          <FileMenu {...actions} />
        </>
      )}
    </header>
  );
}
