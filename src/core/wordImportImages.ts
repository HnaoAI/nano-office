// Ouverture d'un fichier Word (T2.18) : images d'un dessin de Word (`w:drawing`) ou d'un ancien dessin VML (`w:pict`),
// avec leur taille et leur texte de remplacement ; zones de texte et formes signalées. Logique pure.
import { detectImageType } from "./images";
import type { DocumentJson } from "./types";
import { alignmentOf } from "./wordImportStyles";
import type { BlockContext, ParagraphState } from "./wordImportTypes";
import { descendants, hasDescendant, intAttr, rAttr } from "./wordXml";

/** Pixels (96 par pouce) d'une longueur en EMU de Word (914 400 par pouce). */
const EMU_PER_PX = 9525;

/** Image d'un dessin de Word (`w:drawing`), ou null avec la raison signalée (zone de texte, forme, format). */
export function drawingImage(
  drawing: Element,
  state: ParagraphState,
  context: BlockContext,
): DocumentJson | null {
  if (hasDescendant(drawing, "txbx") || hasDescendant(drawing, "textbox")) {
    context.skipped.add("textBoxes");
  }
  const blip = descendants(drawing, "blip")[0];
  if (!blip) {
    if (!hasDescendant(drawing, "txbx")) context.skipped.add("shapes");
    return null;
  }
  const extent = descendants(drawing, "extent")[0];
  const cx = intAttr(extent?.getAttribute("cx") ?? null);
  const docPr = descendants(drawing, "docPr")[0];
  const alt = docPr?.getAttribute("descr") || docPr?.getAttribute("title") || "";
  return imageNode(rAttr(blip, "embed"), cx === null ? null : cx / EMU_PER_PX, alt, state, context);
}

/** Image d'un ancien dessin de Word (`w:pict`, VML), ou null avec la raison signalée. */
export function pictImage(
  pict: Element,
  state: ParagraphState,
  context: BlockContext,
): DocumentJson | null {
  const data = descendants(pict, "imagedata")[0];
  if (!data) {
    context.skipped.add(hasDescendant(pict, "textbox") ? "textBoxes" : "shapes");
    return null;
  }
  const shape = descendants(pict, "shape")[0];
  const width = /width:\s*([\d.]+)pt/.exec(shape?.getAttribute("style") ?? "")?.[1];
  const alt = shape?.getAttribute("alt") ?? "";
  return imageNode(
    rAttr(data, "id"),
    width ? (Number(width) * 96) / 72 : null,
    alt,
    state,
    context,
  );
}

/**
 * Nœud image avec une clé provisoire. Une image d'un format que le navigateur n'affiche pas (EMF, WMF, TIFF…)
 * est signalée et laissée de côté.
 */
function imageNode(
  rId: string | null,
  widthPx: number | null,
  alt: string,
  state: ParagraphState,
  context: BlockContext,
): DocumentJson | null {
  const data = rId ? context.media.get(rId) : undefined;
  if (!rId || !data || detectImageType(data) === null) {
    context.skipped.add("unsupportedImages");
    return null;
  }
  let key = context.imageKeys.get(rId);
  if (!key) {
    key = `word-image-${String(context.imageKeys.size + 1)}`;
    context.imageKeys.set(rId, key);
    context.images.set(key, data);
  }
  const width = widthPx !== null && widthPx >= 1 ? Math.round(widthPx) : null;
  return {
    type: "image",
    attrs: { hash: key, alt, width, textAlign: alignmentOf(state.align) },
  };
}
