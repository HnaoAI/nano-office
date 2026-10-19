// Libellés des raccourcis clavier affichés dans les infobulles et sur les boutons.

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** Nom de la touche de commande affiché dans les infobulles : Cmd sur Mac, Ctrl ailleurs. */
export const MOD = IS_MAC ? "Cmd" : "Ctrl";

/** Raccourci affiché sur le bouton « Enregistrer » (U1a, critère 1) : ⌘S sur Mac, Ctrl+S ailleurs. */
export const SAVE_SHORTCUT = IS_MAC ? "⌘S" : "Ctrl+S";
