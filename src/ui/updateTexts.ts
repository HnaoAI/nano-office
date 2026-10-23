// Textes de la fenêtre « Nano Buro se met à jour » et du message affiché après la mise à jour (H3),
// repris tels quels par l'aide (A1, critère 4).

/** Titre de la fenêtre (H3, critère 2). */
export const UPDATE_TITLE = "Nano Buro se met à jour…";

/** Texte discret sous le titre (H3, critère 2). */
export const UPDATE_REASSURANCE =
  "Vos documents ne sont pas touchés. Cela prend quelques secondes.";

/**
 * Message d'information affiché après le rechargement (H3, critère 6).
 * @param version version affichée sous le nom, par exemple `v2026.10.23·a16f19a`
 */
export function updatedNotice(version: string): string {
  return `Nano Buro a été mis à jour (${version}).`;
}
