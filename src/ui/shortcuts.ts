// Libellés des raccourcis clavier affichés dans les infobulles des boutons.

/** Nom de la touche de commande affiché dans les infobulles : Cmd sur Mac, Ctrl ailleurs. */
export const MOD =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "Cmd" : "Ctrl";
