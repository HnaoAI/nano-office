// Tableaux du document (T1.8) : nœuds table, tableRow, tableHeader et tableCell de Tiptap (licence MIT),
// adaptés aux règles de Nano Buro. Utilisés par le schéma partagé (src/core/schema.ts).
import Document from "@tiptap/extension-document";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { IMAGE_GROUP } from "./imageSchema";
import { PAGE_BREAK_GROUP } from "./pageBreakSchema";
import { CALLOUT_GROUP } from "./calloutSchema";

/**
 * Groupe propre aux tableaux, à la place du groupe « block » de Tiptap.
 * INVARIANT : une cellule (`block+`) et un élément de liste (`paragraph block*`) n'acceptent que le
 * groupe « block » ; le tableau n'en fait pas partie, donc un tableau ne peut jamais contenir un autre
 * tableau, ni être placé dans une liste (T1.8, critère 4). Seul le document l'accepte.
 */
export const TABLE_GROUP = "documentTable";

/**
 * Document : des blocs, des tableaux (T1.8), des images (T1.9), des sauts de page (T2.8) et des encadrés (T2.19). Un document du
 * lot A reste valide.
 */
export const DocumentWithTables = Document.extend({
  content: `(block | ${TABLE_GROUP} | ${IMAGE_GROUP} | ${PAGE_BREAK_GROUP} | ${CALLOUT_GROUP})+`,
});

/**
 * Tableau : toute la largeur de la page, colonnes égales (src/ui/styles/tables.css), sans
 * redimensionnement à la souris (hors périmètre). Tab, Shift+Tab et Tab dans la dernière cellule
 * viennent de Tiptap (critère 3) ; les raccourcis des listes passent avant (src/editor/keyboardShortcuts.ts).
 */
export const DocumentTable = Table.extend({ group: TABLE_GROUP }).configure({
  resizable: false,
  allowTableNodeSelection: false,
});

/** Nœuds des tableaux, dans l'ordre attendu par Tiptap. */
export const tableExtensions = [DocumentTable, TableRow, TableHeader, TableCell];

/** Nombre maximal de lignes et de colonnes proposé par la grille d'insertion (T1.8, critère 1). */
export const TABLE_GRID_SIZE = 8;
