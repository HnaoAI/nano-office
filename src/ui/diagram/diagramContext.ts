// Contexte partagé par les formes et les flèches de l'éditeur de schémas (T2.20) : formes à leur place
// affichée, mesure des textes, texte en cours de saisie.
import { createContext } from "react";
import { approximateMeasure, type DiagramShape, type MeasureText } from "../../core/diagram";

/** Ce que les formes et les flèches lisent de l'éditeur. */
export interface DiagramContextValue {
  /** Formes par identifiant, à leur position et à leur taille affichées (la flèche suit, critère 3). */
  shapes: ReadonlyMap<string, DiagramShape>;
  measure: MeasureText;
  /** Forme ou flèche dont le texte est en cours de saisie, ou null. */
  editingText: string | null;
  startText: (id: string) => void;
  finishText: (id: string, text: string) => void;
}

/** Contexte de l'éditeur de schémas. */
export const DiagramContext = createContext<DiagramContextValue>({
  shapes: new Map(),
  measure: approximateMeasure,
  editingText: null,
  startText: () => undefined,
  finishText: () => undefined,
});
