// Souvenirs, le temps d'un lancement, de la mise à jour au démarrage, rangés dans sessionStorage : propres à
// la fenêtre, oubliés à sa fermeture. L'application s'est déjà rechargée (ticket H1, critère 7), message
// « mis à jour » à afficher après le rechargement (H3, critère 6).

/** Clé sessionStorage. Préfixe technique « nano-office » gardé malgré le renommage (R1). */
const RELOADED_KEY = "nano-office-update-reloaded";

/** Vrai si la fenêtre s'est déjà rechargée pour une mise à jour depuis son ouverture. */
export function hasReloadedForUpdate(): boolean {
  try {
    return sessionStorage.getItem(RELOADED_KEY) !== null;
  } catch {
    // Stockage bloqué : on fait comme si le rechargement avait eu lieu, pour ne jamais boucler.
    return true;
  }
}

/** Retient le rechargement, juste avant de le faire. Renvoie faux si le souvenir n'a pas pu être écrit. */
export function markReloadedForUpdate(): boolean {
  try {
    sessionStorage.setItem(RELOADED_KEY, new Date().toISOString());
    return true;
  } catch {
    return false;
  }
}

/**
 * Clé sessionStorage du message « Nano Buro a été mis à jour » (H3, critère 6), écrite juste avant le
 * rechargement de mise à jour et lue une seule fois par la page rechargée.
 */
const NOTICE_KEY = "nano-office-update-notice";

/** Retient qu'un message « mis à jour » est à afficher après le rechargement (H3, critère 6). */
export function markUpdateNotice(): void {
  try {
    sessionStorage.setItem(NOTICE_KEY, "1");
  } catch {
    // Stockage bloqué : le message ne s'affichera pas, la mise à jour se fait quand même.
  }
}

/** Oublie le message « mis à jour » : le rechargement n'a pas eu lieu (déblocage au bout de 20 s, H3). */
export function clearUpdateNotice(): void {
  try {
    sessionStorage.removeItem(NOTICE_KEY);
  } catch {
    // Rien à oublier.
  }
}

/**
 * Vrai si cette page vient d'être rechargée pour une mise à jour (H3, critères 1 et 6). Le souvenir est
 * effacé à la lecture : un rechargement fait ensuite à la main n'affiche plus le message.
 */
export function takeUpdateNotice(): boolean {
  try {
    const found = sessionStorage.getItem(NOTICE_KEY) !== null;
    sessionStorage.removeItem(NOTICE_KEY);
    return found;
  } catch {
    return false;
  }
}
