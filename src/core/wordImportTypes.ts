// Ouverture d'un fichier Word (T2.18) : types partagés par la lecture des blocs (wordImportBlocks.ts), des champs
// (wordImportFields.ts), des images (wordImportImages.ts) et le regroupement (wordImportGroups.ts). Aucune logique.
import type { CalloutStyle } from "./calloutSchema";
import type { DocumentJson } from "./types";
import type { ParagraphProps, WordStyles } from "./wordImportStyles";

/**
 * Éléments d'un fichier Word qui n'ont pas pu être repris, ou seulement en partie (critère 3), signalés dans
 * le message affiché à l'ouverture.
 */
export type WordSkipped =
  | "comments"
  | "textBoxes"
  | "shapes"
  | "footnotes"
  | "headerFooter"
  | "fields"
  | "equations"
  | "unsupportedImages"
  | "refusedImages"
  | "mergedCells"
  | "nestedTables"
  | "tableImages";

/** Relation d'un fichier de l'archive : sa cible, et vrai si elle est hors de l'archive (lien web). */
export interface WordRelationship {
  type: string;
  target: string;
  external: boolean;
}

/** Champ de Word en cours de lecture (`w:fldChar`) : son code, puis son résultat affiché. */
export interface Field {
  code: string;
  phase: "code" | "result";
  kind: "link" | "toc" | "other";
  href: string | null;
}

/** État d'une conversion. */
export interface BlockContext {
  styles: WordStyles;
  rels: ReadonlyMap<string, WordRelationship>;
  /** Contenu des images de l'archive, par identifiant de relation. */
  media: ReadonlyMap<string, Uint8Array>;
  /** Images utilisées, par clé provisoire (attribut `hash` du nœud image, remplacé par l'empreinte ensuite). */
  images: Map<string, Uint8Array>;
  skipped: Set<WordSkipped>;
  /** Vrai si le fichier contient un suivi des modifications, lu dans son état final (critère 3). */
  trackedChanges: boolean;
  fields: Field[];
  /** Nombre d'éléments de premier niveau déjà écrits pour chaque liste de Word, pour continuer sa numérotation. */
  listCounts: Map<string, number>;
  /** Clé provisoire de chaque image déjà lue, par identifiant de relation : une image répétée n'est rangée qu'une fois. */
  imageKeys: Map<string, string>;
  /**
   * Vrai pour une seconde lecture qui ignore les champs : un champ jamais fermé (fichier mal écrit par un autre
   * logiciel) cacherait sinon tout le texte qui le suit.
   */
  ignoreFields?: boolean;
}

/** Liste de Word d'un paragraphe : son numéro, son niveau (0 à 2) et son type. */
export interface ListRef {
  numId: string;
  level: number;
  ordered: boolean;
  /** Premier numéro de la liste dans Word (`w:start`), 1 le plus souvent. */
  start: number;
}

/** Bloc lu, avant le regroupement des listes et des encadrés (wordImportGroups.ts). */
export type Item =
  | {
      kind: "text";
      node: DocumentJson;
      list: ListRef | null;
      callout: CalloutStyle | null;
      /** Marge de gauche en vingtièmes de point, pour reconnaître un paragraphe de suite d'un élément de liste. */
      indentLeft: number | null;
      /** Vrai pour le titre d'un sommaire de Word (« Table des matières »), retiré devant le sommaire. */
      tocHeading: boolean;
    }
  | { kind: "image"; node: DocumentJson; callout: CalloutStyle | null }
  | { kind: "pageBreak" }
  | { kind: "toc" }
  | { kind: "table"; rows: TableCellItems[][] };

/** Cellule de tableau lue : ses blocs (paragraphes seulement), et vrai pour une cellule de la ligne d'en-tête. */
export interface TableCellItems {
  header: boolean;
  items: Item[];
}

/** Morceau d'un paragraphe : du texte, une image, un saut de page, un retour à la ligne ou le sommaire. */
export type Piece =
  | { kind: "text"; text: string; marks: NonNullable<DocumentJson["marks"]> }
  | { kind: "image"; node: DocumentJson }
  | { kind: "pageBreak" }
  | { kind: "lineBreak" }
  | { kind: "toc" };

/** État de lecture d'un paragraphe. */
export interface ParagraphState {
  props: ParagraphProps;
  heading: boolean;
  align: string | null;
  pieces: Piece[];
  /** Vrai si une partie du paragraphe appartient à un sommaire de Word. */
  touchedToc: boolean;
  inTable: boolean;
}
