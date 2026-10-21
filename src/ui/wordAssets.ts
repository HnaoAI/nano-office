// Fichiers des polices du document à embarquer dans un export Word (T2.7, critère 4), et préparation des
// images pour Word. Polices : les fichiers WOFF de Fontsource (licence SIL OFL 1.1, qui permet de les
// embarquer), livrés avec l'application et mis en cache hors ligne (vite.config.ts), jamais chargés
// depuis un autre site. Alphabet latin seulement, comme à l'écran (src/ui/fonts.ts).
import ibmPlexSans400Normal from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff?url";
import ibmPlexSans700Normal from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff?url";
import ibmPlexSans400Italic from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-italic.woff?url";
import ibmPlexSans700Italic from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-italic.woff?url";
import ibmPlexSerif400Normal from "@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-400-normal.woff?url";
import ibmPlexSerif700Normal from "@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-700-normal.woff?url";
import ibmPlexSerif400Italic from "@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-400-italic.woff?url";
import ibmPlexSerif700Italic from "@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-700-italic.woff?url";
import ibmPlexMono400Normal from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff?url";
import ibmPlexMono700Normal from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-normal.woff?url";
import sourceSans3400Normal from "@fontsource/source-sans-3/files/source-sans-3-latin-400-normal.woff?url";
import sourceSans3700Normal from "@fontsource/source-sans-3/files/source-sans-3-latin-700-normal.woff?url";
import sourceSans3400Italic from "@fontsource/source-sans-3/files/source-sans-3-latin-400-italic.woff?url";
import sourceSans3700Italic from "@fontsource/source-sans-3/files/source-sans-3-latin-700-italic.woff?url";
import ebGaramond400Normal from "@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff?url";
import ebGaramond700Normal from "@fontsource/eb-garamond/files/eb-garamond-latin-700-normal.woff?url";
import ebGaramond400Italic from "@fontsource/eb-garamond/files/eb-garamond-latin-400-italic.woff?url";
import ebGaramond700Italic from "@fontsource/eb-garamond/files/eb-garamond-latin-700-italic.woff?url";
import { imageRefs, readImage } from "../core/images";
import { imageSize } from "../core/imageSize";
import type { DocumentJson } from "../core/types";
import type { WordFont, WordImage } from "../core/wordExport";
import { woffToSfnt } from "../core/woff";
import { convertToPng } from "../editor/imageImport";
import type * as Y from "yjs";

/** Styles d'une police : normal, gras, italique, gras italique (IBM Plex Mono : sans italique, T1.4). */
type FontFiles = Partial<Record<"regular" | "bold" | "italic" | "boldItalic", string>>;

/** Adresse des fichiers WOFF de chaque police du document. */
const FONT_FILES: Record<string, FontFiles> = {
  "IBM Plex Sans": {
    regular: ibmPlexSans400Normal,
    bold: ibmPlexSans700Normal,
    italic: ibmPlexSans400Italic,
    boldItalic: ibmPlexSans700Italic,
  },
  "IBM Plex Serif": {
    regular: ibmPlexSerif400Normal,
    bold: ibmPlexSerif700Normal,
    italic: ibmPlexSerif400Italic,
    boldItalic: ibmPlexSerif700Italic,
  },
  "IBM Plex Mono": { regular: ibmPlexMono400Normal, bold: ibmPlexMono700Normal },
  "Source Sans 3": {
    regular: sourceSans3400Normal,
    bold: sourceSans3700Normal,
    italic: sourceSans3400Italic,
    boldItalic: sourceSans3700Italic,
  },
  "EB Garamond": {
    regular: ebGaramond400Normal,
    bold: ebGaramond700Normal,
    italic: ebGaramond400Italic,
    boldItalic: ebGaramond700Italic,
  },
};

/** Police TrueType lue depuis un fichier WOFF de l'application, ou undefined si elle ne se lit pas. */
async function loadFace(url: string | undefined): Promise<Uint8Array | undefined> {
  if (!url) return undefined;
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    return await woffToSfnt(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return undefined;
  }
}

/**
 * Polices à embarquer pour les noms donnés. Une police dont le style normal ne se lit pas n'est pas
 * embarquée : seul son nom est écrit dans le fichier, et Word la remplace s'il ne l'a pas.
 */
export async function loadWordFonts(names: readonly string[]): Promise<WordFont[]> {
  const fonts = await Promise.all(
    names.map(async (name) => {
      const files = FONT_FILES[name];
      if (!files) return null;
      const [regular, bold, italic, boldItalic] = await Promise.all(
        [files.regular, files.bold, files.italic, files.boldItalic].map(loadFace),
      );
      return regular ? { name, regular, bold, italic, boldItalic } : null;
    }),
  );
  return fonts.filter((font) => font !== null);
}

const WORD_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif" } as const;

/**
 * Images du document prêtes pour Word, par empreinte : PNG, JPEG et GIF tels quels, WebP converti en
 * PNG (Word ne le lit pas). Une image absente ou illisible n'y est pas : elle s'exporte « Image manquante ».
 */
export async function loadWordImages(
  ydoc: Y.Doc,
  content: DocumentJson,
): Promise<Map<string, WordImage>> {
  const images = new Map<string, WordImage>();
  for (const hash of imageRefs(content)) {
    const stored = readImage(ydoc, hash);
    if (!stored) continue;
    const data = stored.type === "image/webp" ? await convertToPng(stored) : stored.data;
    const type = stored.type === "image/webp" ? "image/png" : stored.type;
    const size = data ? imageSize(data, type) : null;
    if (!data || !size) continue;
    images.set(hash, { type: WORD_TYPES[type], data, ...size });
  }
  return images;
}
