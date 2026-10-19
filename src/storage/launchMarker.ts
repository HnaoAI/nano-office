// Souvenir, le temps d'un lancement, que l'application s'est déjà rechargée pour appliquer une mise à
// jour (ticket H1, critère 7). Rangé dans sessionStorage : propre à la fenêtre, oublié à sa fermeture.

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
