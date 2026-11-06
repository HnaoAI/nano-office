// Textes de la fenêtre « Mes fautes » (T2.23), repris par les tests et, si besoin, par l'aide (A1).

/** Phrase affichée sans aucune faute comptée (critère 13). */
export const NO_MISTAKES_TEXT =
  "Aucune faute comptée pour l'instant. Utilisez « Corriger », puis acceptez les corrections.";

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** « 5 novembre 2026 », et « 1er novembre 2026 » pour le premier du mois. */
export function sinceText(iso: string): string {
  const date = new Date(iso);
  const text = dateFormat.format(date);
  return date.getDate() === 1 ? text.replace(/^1 /, "1er ") : text;
}
