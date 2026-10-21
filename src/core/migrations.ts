// Migrations du format `.nano` (voir CLAUDE.md : tout changement de format incrémente `version` et
// ajoute une migration testée). Code pur : elles travaillent sur le JSON lu, avant sa vérification.

/**
 * Version 1 vers version 2 (T1.9, critère 7) : ajoute la liste des images, vide, car un fichier
 * version 1 ne peut pas en contenir. `content` et `ydoc` sont repris tels quels : le schéma de la
 * version 2 accepte tout document de la version 1. Le fichier sur le disque n'est pas modifié ; il
 * sera écrit en version 2 au prochain enregistrement.
 * @param data fichier version 1 déjà lu en JSON (seul `version` est supposé valide)
 */
export function migrateV1ToV2(data: Record<string, unknown>): Record<string, unknown> {
  return { ...data, version: 2, images: {} };
}

/**
 * Amène un fichier lu à la version actuelle, une migration après l'autre.
 * @returns le fichier migré, ou null si sa version est inconnue (plus récente, ou invalide)
 */
export function migrateToCurrent(
  data: Record<string, unknown>,
  currentVersion: number,
): Record<string, unknown> | null {
  let migrated = data;
  if (migrated.version === 1) migrated = migrateV1ToV2(migrated);
  return migrated.version === currentVersion ? migrated : null;
}
