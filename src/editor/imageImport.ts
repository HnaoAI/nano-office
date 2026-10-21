// Préparation d'une image à l'insertion (T1.9, critères 1 et 2) : format vérifié aux premiers octets,
// taille limitée à 25 Mo, réduction à 1 600 px avec createImageBitmap et un canvas, dans le navigateur.
// Les règles (taille, format final) sont dans src/core/images.ts, testées sans navigateur.
import {
  detectImageType,
  JPEG_QUALITY,
  MAX_IMAGE_BYTES,
  planImageEncoding,
  type ImageType,
  type StoredImage,
} from "../core/images";

/**
 * Raison d'un refus :
 * - `too-large` : plus de 25 Mo ;
 * - `unsupported` : ni JPEG, ni PNG, ni WebP, ni GIF ;
 * - `unreadable` : le navigateur ne sait pas décoder l'image (fichier abîmé).
 */
export type ImageRejection = "too-large" | "unsupported" | "unreadable";

/** Résultat de `prepareImage`. */
export type PreparedImage =
  { ok: true; image: StoredImage } | { ok: false; reason: ImageRejection };

/** Canvas de la taille demandée : OffscreenCanvas si le navigateur l'a, sinon un canvas de la page. */
function createCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Contenu du canvas dans le format demandé. */
async function encodeCanvas(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: ImageType,
): Promise<Blob | null> {
  const quality = type === "image/jpeg" ? JPEG_QUALITY : undefined;
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

/** Dessine l'image à la taille demandée. */
function draw(bitmap: ImageBitmap, width: number, height: number) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d") as
    OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!context) throw new Error("canvas indisponible");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  return { canvas, context };
}

/** Vrai si au moins un pixel n'est pas opaque. */
function hasTransparency(
  context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  const pixels = context.getImageData(0, 0, width, height).data;
  for (let alpha = 3; alpha < pixels.length; alpha += 4) {
    if (pixels[alpha] !== 255) return true;
  }
  return false;
}

/**
 * Prépare une image choisie, déposée ou collée. Ne lève jamais d'exception.
 * Une image déjà petite garde ses octets d'origine ; une grande est réduite à 1 600 px sur son grand
 * côté, en JPEG (qualité 0,8) ou en PNG si elle a de la transparence ; un GIF garde sa première image,
 * en PNG (critères 1 et 2).
 */
export async function prepareImage(blob: Blob): Promise<PreparedImage> {
  if (blob.size > MAX_IMAGE_BYTES) return { ok: false, reason: "too-large" };
  let data: Uint8Array;
  try {
    data = new Uint8Array(await blob.arrayBuffer());
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const type = detectImageType(data);
  if (!type) return { ok: false, reason: "unsupported" };
  let bitmap: ImageBitmap;
  try {
    // Orientation EXIF appliquée explicitement : une photo de téléphone reste droite, quelle que soit
    // la valeur par défaut du navigateur (relecture du lot D).
    bitmap = await createImageBitmap(new Blob([data as BlobPart], { type }), {
      imageOrientation: "from-image",
    });
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  try {
    const size = { type, width: bitmap.width, height: bitmap.height };
    let plan = planImageEncoding({ ...size, transparent: false });
    if (!plan.reencode) return { ok: true, image: { type, data } };
    if (bitmap.width === 0 || bitmap.height === 0) return { ok: false, reason: "unreadable" };
    const { canvas, context } = draw(bitmap, plan.width, plan.height);
    // La transparence ne se lit qu'au besoin : une photo JPEG n'en a jamais.
    if (type !== "image/jpeg" && plan.type === "image/jpeg") {
      plan = planImageEncoding({
        ...size,
        transparent: hasTransparency(context, plan.width, plan.height),
      });
    }
    const encoded = await encodeCanvas(canvas, plan.type);
    if (!encoded) return { ok: false, reason: "unreadable" };
    return {
      ok: true,
      image: { type: plan.type, data: new Uint8Array(await encoded.arrayBuffer()) },
    };
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    bitmap.close();
  }
}

/**
 * Image réencodée en PNG, à sa taille : pour un export Word, qui ne lit pas le WebP (T2.7).
 * @returns le PNG, ou null si le navigateur ne peut pas décoder l'image
 */
export async function convertToPng(image: StoredImage): Promise<Uint8Array | null> {
  try {
    const bitmap = await createImageBitmap(
      new Blob([image.data as BlobPart], { type: image.type }),
    );
    const { canvas } = draw(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
    const blob = await encodeCanvas(canvas, "image/png");
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
