// Dimensions d'une image (largeur et hauteur en pixels) lues dans son en-tête, sans la décoder : pour
// donner sa taille à une image exportée en Word (T2.7). PNG, JPEG, GIF et WebP. Logique pure.

/** Largeur et hauteur d'une image, en pixels. */
export interface ImageSize {
  width: number;
  height: number;
}

function u16be(bytes: Uint8Array, at: number): number {
  return ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
}

function u16le(bytes: Uint8Array, at: number): number {
  return (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8);
}

function u24le(bytes: Uint8Array, at: number): number {
  return u16le(bytes, at) | ((bytes[at + 2] ?? 0) << 16);
}

function u32be(bytes: Uint8Array, at: number): number {
  return u16be(bytes, at) * 0x10000 + u16be(bytes, at + 2);
}

/** JPEG : la taille est dans le premier segment SOF (marqueurs C0 à CF, sauf C4, C8 et CC). */
function jpegSize(bytes: Uint8Array): ImageSize | null {
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    const length = u16be(bytes, at + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: u16be(bytes, at + 5), width: u16be(bytes, at + 7) };
    }
    at += 2 + length;
  }
  return null;
}

/** WebP : formats VP8 (avec perte), VP8L (sans perte) et VP8X (étendu). */
function webpSize(bytes: Uint8Array): ImageSize | null {
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk === "VP8 ") {
    return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    const bits = u16le(bytes, 21) | (u16le(bytes, 23) << 16);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") return { width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
  return null;
}

/**
 * Dimensions d'une image, ou null si l'en-tête ne les donne pas (image abîmée).
 * @param bytes contenu de l'image
 * @param type format reconnu (`detectImageType`)
 */
export function imageSize(bytes: Uint8Array, type: string): ImageSize | null {
  let size: ImageSize | null = null;
  if (type === "image/png" && bytes.length >= 24) {
    size = { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  } else if (type === "image/gif" && bytes.length >= 10) {
    size = { width: u16le(bytes, 6), height: u16le(bytes, 8) };
  } else if (type === "image/jpeg") {
    size = jpegSize(bytes);
  } else if (type === "image/webp" && bytes.length >= 30) {
    size = webpSize(bytes);
  }
  return size && size.width > 0 && size.height > 0 ? size : null;
}
