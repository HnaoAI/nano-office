// Image d'un schéma pour l'export Word (T2.20, critère 9) : le dessin SVG, recadré sur ses formes, rendu
// en PNG à deux fois sa taille par un canvas, avec la police IBM Plex Sans embarquée dans le dessin
// (une image SVG ne voit pas les polices de la page). Chargé avec l'export Word, à la demande.
import ibmPlexSans400Normal from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff?url";
import { bytesToBase64 } from "../../core/base64";
import { contentBounds, DIAGRAM_FONT_FAMILY, readDiagram } from "../../core/diagram";
import { DIAGRAM_NODE } from "../../core/diagramSchema";
import { diagramToSvg } from "../../core/diagramSvg";
import type { DocumentJson } from "../../core/types";
import { diagramImageKey, type WordImage } from "../../core/wordBlocks";
import { measureDiagramText } from "../../editor/diagram";

/** Marge autour des formes dans l'image, en pixels. */
const IMAGE_PADDING = 12;

/** Échelle de l'image : deux fois la taille affichée, pour rester nette (critère 9). */
const IMAGE_SCALE = 2;

let fontFace: Promise<string> | null = null;

/** Règle `@font-face` d'IBM Plex Sans en données, ou rien si le fichier ne se lit pas. */
function loadFontFace(): Promise<string> {
  fontFace ??= (async () => {
    try {
      const response = await fetch(ibmPlexSans400Normal);
      if (!response.ok) return "";
      const data = bytesToBase64(new Uint8Array(await response.arrayBuffer()));
      return `@font-face{font-family:"${DIAGRAM_FONT_FAMILY}";src:url(data:font/woff;base64,${data}) format("woff");}`;
    } catch {
      return "";
    }
  })();
  return fontFace;
}

/** Image SVG chargée dans un élément `img`. */
function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("dessin illisible"));
    };
    image.src = url;
  });
}

/**
 * PNG d'un schéma (critère 9), ou null pour un schéma vide ou si le navigateur ne sait pas le dessiner.
 * Les dimensions sont celles de l'image dans le document Word, en pixels (96 par pouce).
 */
export async function diagramPng(
  attrs: Record<string, unknown> | undefined,
): Promise<WordImage | null> {
  const data = readDiagram(attrs);
  const bounds = contentBounds(data);
  if (!bounds) return null;
  const width = Math.ceil(bounds.width + IMAGE_PADDING * 2);
  const height = Math.ceil(bounds.height + IMAGE_PADDING * 2);
  const svg = diagramToSvg(data, {
    height,
    cropPadding: IMAGE_PADDING,
    measure: measureDiagramText,
    style: await loadFontFace(),
  });
  try {
    const image = await loadSvg(svg);
    const canvas = document.createElement("canvas");
    canvas.width = width * IMAGE_SCALE;
    canvas.height = height * IMAGE_SCALE;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return null;
    return { type: "png", data: new Uint8Array(await blob.arrayBuffer()), width, height };
  } catch {
    return null;
  }
}

/** Images des schémas du document, rangées sous `diagramImageKey`, pour l'export Word. */
export async function loadDiagramImages(content: DocumentJson): Promise<Map<string, WordImage>> {
  const images = new Map<string, WordImage>();
  for (const node of content.content ?? []) {
    if (node.type !== DIAGRAM_NODE) continue;
    const key = diagramImageKey(node);
    if (!key || images.has(key)) continue;
    const png = await diagramPng(node.attrs);
    if (png) images.set(key, png);
  }
  return images;
}
