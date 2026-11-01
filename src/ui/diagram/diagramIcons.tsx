// Icônes au trait de la petite barre d'un schéma en modification (T2.20, critère 2), au style de la
// charte : 18 px, trait de 1,75 px, couleur du texte.
import type { DiagramShapeKind } from "../../core/diagram";
import { Icon } from "../icons";

/** Icône d'une forme proposée. */
export function ShapeIcon({ kind }: { kind: DiagramShapeKind }) {
  return (
    <Icon>
      {kind === "rectangle" && <rect x="3" y="6" width="18" height="12" />}
      {kind === "rounded" && <rect x="3" y="6" width="18" height="12" rx="4" />}
      {kind === "circle" && <circle cx="12" cy="12" r="8" />}
      {kind === "diamond" && <path d="M12 3l9 9-9 9-9-9z" />}
    </Icon>
  );
}

/** Supprimer les formes et flèches choisies. */
export function TrashIcon() {
  return (
    <Icon>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </Icon>
  );
}
