// Conversion entre octets et base64, pour stocker l'état Yjs dans le fichier `.nano`.
// Utilise btoa et atob, présents dans les navigateurs et dans Node (version 16 et suivantes).

/** Taille des tranches passées à `String.fromCharCode`, pour ne pas dépasser la pile sur un gros document. */
const CHUNK_SIZE = 0x8000;

/** Encode des octets en base64. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK_SIZE));
  }
  return btoa(binary);
}

/**
 * Décode une chaîne base64 en octets.
 * @throws si la chaîne n'est pas du base64 valide.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
