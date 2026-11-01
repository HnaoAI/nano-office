// Noms des fichiers Word (T2.18), à part de wordImport.ts pour que « Ouvrir… » les reconnaisse sans charger
// la lecture de Word (JSZip), chargée seulement à l'ouverture d'un fichier Word. Logique pure.

/** Vrai si le nom est celui d'un fichier de traitement de texte autre que `.nano` (Word, ancien Word, OpenDocument). */
export function isWordFileName(name: string): boolean {
  return /\.(docx|docm|dotx|dotm|doc|dot|odt)$/i.test(name);
}

/** Nom proposé par « Enregistrer » pour un document ouvert depuis Word : celui du fichier, avec `.nano` (critère 1). */
export function nanoNameOf(wordName: string): string {
  const base = wordName.replace(/\.(docx|docm|dotx|dotm)$/i, "");
  return `${base || "document"}.nano`;
}
