// Statistiques de « Mes fautes » (T2.23), dans le localStorage de ce navigateur, sur cet ordinateur,
// à part des copies de secours (IndexedDB). Un seul compte par ordinateur, sans profils.
// INVARIANT : jamais dans un fichier `.nano`, l'export Word, le Y.Doc ni le réseau (critère 7).
import { emptyMistakeStats, readMistakeStats, type MistakeStats } from "../core/mistakes";

/** Entrée des statistiques. Préfixe technique « nano-office », comme les copies de secours (R1). */
export const MISTAKE_STATS_KEY = "nano-office:mistake-stats";

/** Stockage utilisé ; `localStorage` dans l'application, un faux dans les tests. */
type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Stockage bloqué par le navigateur (navigation privée stricte) : statistiques vides.
    return null;
  }
}

/**
 * Statistiques enregistrées. Sans statistiques, ou si elles sont illisibles, un compte vide qui
 * commence à `now`.
 */
export function loadMistakeStats(
  now: Date = new Date(),
  storage: KeyValueStorage | null = defaultStorage(),
): MistakeStats {
  try {
    const text = storage?.getItem(MISTAKE_STATS_KEY);
    return text ? readMistakeStats(JSON.parse(text) as unknown, now) : emptyMistakeStats(now);
  } catch {
    return emptyMistakeStats(now);
  }
}

/** Enregistre les statistiques ; un stockage plein ou bloqué est ignoré, sans rien casser. */
export function saveMistakeStats(
  stats: MistakeStats,
  storage: KeyValueStorage | null = defaultStorage(),
): void {
  try {
    storage?.setItem(MISTAKE_STATS_KEY, JSON.stringify(stats));
  } catch {
    // Rien à faire : le compte de cette page sera seulement oublié au prochain lancement.
  }
}
