// Reconnaît un Mac, pour choisir les raccourcis clavier (T1.1) et leurs libellés dans l'interface.

/**
 * Vrai sur Mac (et iPhone, iPad) d'après `navigator.userAgent`, faux ailleurs ou sans navigateur.
 * Les tests Playwright changent l'agent utilisateur pour vérifier les deux jeux de raccourcis.
 */
export function isMacPlatform(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
}
