// Plan du document ouvert ou fermé (T2.9, critère 1), retenu dans le localStorage de ce navigateur, sur
// cet ordinateur. Jamais dans le document ni dans le fichier `.nano` (critère 8).

/** Entrée du choix. Préfixe technique « nano-office », comme les copies de secours (R1). */
export const OUTLINE_OPEN_KEY = "nano-office:outline-open";

/** Stockage utilisé ; `localStorage` dans l'application, un faux dans les tests. */
type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Stockage bloqué par le navigateur (navigation privée stricte) : plan fermé.
    return null;
  }
}

/** Vrai si le plan était ouvert ; fermé par défaut, ou si le choix est illisible. */
export function loadOutlineOpen(storage: KeyValueStorage | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(OUTLINE_OPEN_KEY) === "true";
  } catch {
    return false;
  }
}

/** Retient le choix ; un stockage plein ou bloqué est ignoré : le plan reste utilisable. */
export function saveOutlineOpen(
  open: boolean,
  storage: KeyValueStorage | null = defaultStorage(),
): void {
  try {
    storage?.setItem(OUTLINE_OPEN_KEY, open ? "true" : "false");
  } catch {
    // Rien à faire : le choix sera seulement oublié au prochain lancement.
  }
}
