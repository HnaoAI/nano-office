// Libellés des raccourcis clavier affichés dans les infobulles et sur les boutons.
import { isMacPlatform } from "../editor/platform";

const IS_MAC = isMacPlatform();

/** Nom de la touche de commande affiché dans les infobulles : Cmd sur Mac, Ctrl ailleurs. */
export const MOD = IS_MAC ? "Cmd" : "Ctrl";

/** Raccourci affiché sur le bouton « Enregistrer » (U1a, critère 1) : ⌘S sur Mac, Ctrl+S ailleurs. */
export const SAVE_SHORTCUT = IS_MAC ? "⌘S" : "Ctrl+S";

/** Raccourci d'impression affiché dans l'infobulle du bouton « Imprimer » (T2.6) : ⌘P sur Mac, Ctrl+P ailleurs. */
export const PRINT_SHORTCUT = IS_MAC ? "⌘P" : "Ctrl+P";

/**
 * Préfixe des raccourcis de titres (T1.1, critère 4) : Cmd+Option sur Mac, Ctrl+Shift ailleurs,
 * suivi du chiffre du niveau (0 pour le texte normal).
 */
export const HEADING_MOD = IS_MAC ? "Cmd+Option" : "Ctrl+Shift";
