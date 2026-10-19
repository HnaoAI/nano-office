// Numéro de version affiché sous le nom de l'application (ticket H1, critères 10 et 11).
// Calculé à la construction par vite.config.ts, sans numérotation manuelle.

/** Version affichée par le serveur de développement (`npm run dev`). */
export const DEV_VERSION = "dev";

/** Commit affiché quand Git ne donne rien (construction hors d'un dépôt). */
const UNKNOWN_COMMIT = "inconnu";

/**
 * Version d'une construction : `v<AAAA.MM.JJ>·<commit court>`, par exemple `v2026.10.19·a16f19a`.
 * La date est prise en temps universel (UTC), pour être la même sur la CI et sur un ordinateur.
 * @param buildDate moment de la construction
 * @param commit identifiant complet ou court du commit construit ; vide si inconnu
 */
export function formatVersion(buildDate: Date, commit: string): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${buildDate.getUTCFullYear()}.${pad(buildDate.getUTCMonth() + 1)}.${pad(buildDate.getUTCDate())}`;
  const short = commit.trim().toLowerCase().slice(0, 7) || UNKNOWN_COMMIT;
  return `v${date}·${short}`;
}
