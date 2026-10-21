// Export Word (T2.7) : contenu du fichier .docx produit, lu comme une archive ZIP, sans navigateur.
// Les critères 2 (ouverture dans Word, LibreOffice, Google Docs) se vérifient à la main ; ici, on
// vérifie le XML écrit et que l'archive se relit.
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SETUP, uniformMargins, type PageSetup } from "../../src/core/pageSetup";
import type { DocumentJson } from "../../src/core/types";
import { nearestHighlight } from "../../src/core/wordBlocks";
import {
  exportWord,
  usedFonts,
  wordFileName,
  type WordFont,
  type WordImage,
} from "../../src/core/wordExport";
import { woffToSfnt } from "../../src/core/woff";
import { imageSize } from "../../src/core/imageSize";
import { fakePng } from "./imageHelpers";

/** Archive .docx relue : texte de ses fichiers XML et liste de ses fichiers. */
async function unzip(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const text = async (path: string) => (await zip.file(path)?.async("string")) ?? "";
  return { files: Object.keys(zip.files), text, zip };
}

function textNode(text: string, marks?: DocumentJson["marks"]): DocumentJson {
  return { type: "text", text, ...(marks ? { marks } : {}) };
}

function para(text: string, attrs: Record<string, unknown> = {}, marks?: DocumentJson["marks"]) {
  return { type: "paragraph", attrs: { id: null, ...attrs }, content: [textNode(text, marks)] };
}

function doc(...content: DocumentJson[]): DocumentJson {
  return { type: "doc", content };
}

async function exportOf(
  content: DocumentJson,
  overrides: Partial<{
    pageSetup: PageSetup;
    images: Map<string, WordImage>;
    fonts: WordFont[];
  }> = {},
) {
  const bytes = await exportWord({
    content,
    pageSetup: overrides.pageSetup ?? DEFAULT_PAGE_SETUP,
    images: overrides.images ?? new Map(),
    fonts: overrides.fonts ?? [],
  });
  return unzip(bytes);
}

/** Une image PNG de 1 × 1 pixel, valide. */
const TINY_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

describe("T2.7 : exporter en Word", () => {
  it("critère 1 : le fichier proposé porte le nom du document, en .docx", () => {
    expect(wordFileName("lettre.nano")).toBe("lettre.docx");
    expect(wordFileName("Lettre à Mamie 💌.nano")).toBe("Lettre à Mamie 💌.docx");
    expect(wordFileName(null)).toBe("Sans titre.docx");
  });

  it("critère 2 : l'archive contient les parties d'un document Word", async () => {
    const { files } = await exportOf(doc(para("Bonjour")));
    for (const part of [
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
      "word/styles.xml",
      "word/numbering.xml",
    ]) {
      expect(files).toContain(part);
    }
  });

  it("critère 3 : les titres 1 à 3 utilisent les styles Titre 1 à Titre 3 de Word", async () => {
    const content = doc(
      ...[1, 2, 3].map((level) => ({
        type: "heading",
        attrs: { id: `h-${level}`, level },
        content: [textNode(`Titre ${level}`)],
      })),
    );
    const { text } = await exportOf(content);
    const body = await text("word/document.xml");
    for (const level of [1, 2, 3]) expect(body).toContain(`<w:pStyle w:val="Heading${level}"/>`);
    const styles = await text("word/styles.xml");
    for (const level of [1, 2, 3]) {
      expect(styles).toMatch(
        new RegExp(`w:styleId="Heading${level}"><w:name w:val="heading ${level}"/>`, "i"),
      );
    }
  });

  it("critère 3 : gras, italique, barré, couleur, police, taille et surlignage", async () => {
    const marks = [
      { type: "bold" },
      { type: "italic" },
      { type: "strike" },
      { type: "highlight", attrs: { color: "#FFF176" } },
      {
        type: "textStyle",
        attrs: { fontFamily: "EB Garamond", fontSize: "14pt", color: "#C62828" },
      },
    ];
    const body = await (
      await exportOf(doc(para("Mis en forme", {}, marks)))
    ).text("word/document.xml");
    for (const tag of [
      "<w:b/>",
      "<w:i/>",
      "<w:strike/>",
      '<w:color w:val="C62828"/>',
      '<w:sz w:val="28"/>',
      '<w:highlight w:val="yellow"/>',
    ]) {
      expect(body).toContain(tag);
    }
    expect(body).toMatch(/<w:rFonts w:ascii="EB Garamond"/);
  });

  it("critère 3 : une police inconnue garde la police par défaut", async () => {
    const marks = [{ type: "textStyle", attrs: { fontFamily: "Futura Nova 2030" } }];
    const body = await (
      await exportOf(doc(para("Venu du futur", {}, marks)))
    ).text("word/document.xml");
    expect(body).not.toContain("Futura");
  });

  it("critère 3 : le surlignage prend la couleur de surlignage Word la plus proche", () => {
    expect(nearestHighlight("#FFF176")).toBe("yellow");
    expect(nearestHighlight("#C5E1A5")).toBe("green");
    expect(nearestHighlight("#B3E5FC")).toBe("cyan");
    expect(nearestHighlight("#F8BBD0")).toBe("magenta");
    expect(nearestHighlight("#ff0000")).toBe("red");
    expect(nearestHighlight("#1E40FF")).toBe("blue");
    expect(nearestHighlight("#CCCCCC")).toBe("lightGray");
    expect(nearestHighlight("pas une couleur")).toBe("yellow");
    expect(nearestHighlight(null)).toBe("yellow");
  });

  it("critère 3 : alignement et interligne (valeur de Word, Par défaut comme à l'écran)", async () => {
    const body = await (
      await exportOf(
        doc(
          para("Centré", { textAlign: "center" }),
          para("Justifié", { textAlign: "justify", lineHeight: "1.15" }),
          para("Double", { lineHeight: "2" }),
          para("Par défaut"),
        ),
      )
    ).text("word/document.xml");
    expect(body).toContain('<w:jc w:val="center"/>');
    expect(body).toContain('<w:jc w:val="both"/>');
    expect(body).toMatch(/<w:spacing[^>]*w:line="276"[^>]*w:lineRule="auto"/);
    expect(body).toMatch(/<w:spacing[^>]*w:line="480"/);
    expect(body).toMatch(/<w:spacing[^>]*w:line="330"/);
  });

  it("critère 3 : listes à puces et numérotées, avec leurs niveaux ; chaque liste numérotée repart de 1", async () => {
    const item = (text: string, nested?: DocumentJson): DocumentJson => ({
      type: "listItem",
      attrs: { id: null },
      content: [para(text), ...(nested ? [nested] : [])],
    });
    const content = doc(
      {
        type: "bulletList",
        content: [
          item("Pomme", {
            type: "bulletList",
            content: [item("Golden", { type: "bulletList", content: [item("Bio")] })],
          }),
        ],
      },
      {
        type: "orderedList",
        content: [item("Un"), item("Deux", { type: "orderedList", content: [item("Deux A")] })],
      },
      para("Entre deux"),
      { type: "orderedList", content: [item("Encore un")] },
    );
    const { text } = await exportOf(content);
    const body = await text("word/document.xml");
    const levels = [...body.matchAll(/<w:ilvl w:val="(\d)"\/>/g)].map((match) => match[1]);
    expect(levels).toEqual(["0", "1", "2", "0", "0", "1", "0"]);
    const numIds = [...body.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((match) => match[1]);
    // Les éléments d'une même liste partagent sa numérotation ; une liste imbriquée et la liste
    // suivante ont chacune la leur, et repartent donc de 1, comme à l'écran.
    expect(numIds[3]).toBe(numIds[4]);
    expect(new Set([numIds[3], numIds[5], numIds[6]]).size).toBe(3);
    const numbering = await text("word/numbering.xml");
    expect(numbering).toContain('<w:numFmt w:val="bullet"/>');
    expect(numbering).toContain('<w:numFmt w:val="decimal"/>');
  });

  it("critère 3 : tableaux avec leur ligne d'en-tête, en gras, et lignes jamais coupées", async () => {
    const cell = (type: string, text: string) => ({
      type,
      attrs: { id: null },
      content: [para(text)],
    });
    const content = doc({
      type: "table",
      content: [
        { type: "tableRow", content: [cell("tableHeader", "Nom"), cell("tableHeader", "Âge")] },
        { type: "tableRow", content: [cell("tableCell", "Zoé"), cell("tableCell", "12")] },
        {
          type: "tableRow",
          content: [cell("tableCell", ""), { type: "tableCell", attrs: { id: null }, content: [] }],
        },
      ],
    });
    const body = await (await exportOf(content)).text("word/document.xml");
    expect(body.match(/<w:tr>/g)).toHaveLength(3);
    expect(body).toContain("<w:tblHeader/>");
    expect(body.match(/<w:tblHeader\/>/g)).toHaveLength(1);
    expect(body).toContain("<w:cantSplit/>");
    expect(body).toMatch(/<w:b\/>[\s\S]*Nom/);
    expect(body).toMatch(/<w:tblW w:type="pct" w:w="100%"\/>|<w:tblW w:type="pct" w:w="5000"\/>/);
  });

  it("critère 3 : les images gardent leur taille et leur alignement, et tiennent dans la largeur", async () => {
    const images = new Map<string, WordImage>([
      ["a".repeat(64), { type: "png", data: TINY_PNG, width: 3000, height: 1500 }],
      ["b".repeat(64), { type: "png", data: TINY_PNG, width: 400, height: 200 }],
    ]);
    const content = doc(
      {
        type: "image",
        attrs: {
          id: "i-1",
          hash: "a".repeat(64),
          alt: "Grande photo",
          width: null,
          textAlign: "center",
        },
      },
      {
        type: "image",
        attrs: { id: "i-2", hash: "b".repeat(64), alt: "", width: 100, textAlign: "right" },
      },
      {
        type: "image",
        attrs: { id: "i-3", hash: "c".repeat(64), alt: "", width: null, textAlign: null },
      },
    );
    const { text, files } = await exportOf(content, { images });
    const body = await text("word/document.xml");
    const extents = [...body.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map(([, cx, cy]) => [
      Math.round(Number(cx) / 9525),
      Math.round(Number(cy) / 9525),
    ]);
    // Page A4 en portrait, marges Normales : 16 cm de texte, soit 605 pixels.
    expect(extents).toEqual([
      [605, 302],
      [100, 50],
    ]);
    expect(body).toMatch(/<w:jc w:val="center"\/>[\s\S]*<w:drawing>/);
    expect(body).toContain('descr="Grande photo"');
    expect(body).toContain("Image manquante");
    expect(
      files.filter((file) => file.startsWith("word/media/") && !file.endsWith("/")),
    ).toHaveLength(1);
  });

  it("critère 3 : le format A4, l'orientation et les marges du document", async () => {
    const portrait = await (await exportOf(doc(para("A")))).text("word/document.xml");
    expect(portrait).toMatch(/<w:pgSz w:w="11906" w:h="16838"/);
    expect(portrait).toMatch(/<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/);
    const landscape = await (
      await exportOf(doc(para("A")), {
        pageSetup: {
          orientation: "landscape",
          margins: { top: 1, bottom: 4.9, left: 0.5, right: 1.27 },
        },
      })
    ).text("word/document.xml");
    expect(landscape).toMatch(/<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/);
    expect(landscape).toMatch(/<w:pgMar w:top="567" w:right="720" w:bottom="2778" w:left="283"/);
    const narrow = await (
      await exportOf(doc(para("A")), {
        pageSetup: { orientation: "portrait", margins: uniformMargins(1.27) },
      })
    ).text("word/document.xml");
    expect(narrow).toMatch(/w:top="720"/);
  });

  it("critère 4 : les polices utilisées sont listées, la police par défaut d'abord", () => {
    const content = doc(
      para("a", {}, [{ type: "textStyle", attrs: { fontFamily: "EB Garamond" } }]),
      para("b", {}, [{ type: "textStyle", attrs: { fontFamily: "Inconnue" } }]),
      para("c", {}, [{ type: "textStyle", attrs: { fontFamily: "EB Garamond" } }]),
    );
    expect(usedFonts(content)).toEqual(["IBM Plex Sans", "EB Garamond"]);
    expect(usedFonts(doc())).toEqual(["IBM Plex Sans"]);
  });

  it("critère 4 : une police WOFF de l'application devient une police TrueType valide", async () => {
    const woff = readFileSync(
      new URL(
        "../../node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff",
        import.meta.url,
      ),
    );
    const sfnt = await woffToSfnt(new Uint8Array(woff));
    const view = new DataView(sfnt.buffer);
    expect(view.getUint32(0)).toBe(0x00010000);
    const tables = view.getUint16(4);
    expect(tables).toBe(woff.readUInt16BE(12));
    const tags: string[] = [];
    for (let index = 0; index < tables; index++) {
      const entry = 12 + index * 16;
      const tag = String.fromCharCode(...sfnt.subarray(entry, entry + 4));
      tags.push(tag);
      const offset = view.getUint32(entry + 8);
      const length = view.getUint32(entry + 12);
      expect(offset % 4).toBe(0);
      expect(offset + length).toBeLessThanOrEqual(sfnt.length);
      if (tag === "head") continue;
      // Somme de contrôle de chaque table, recalculée sur les octets décompressés.
      let sum = 0;
      for (let at = offset; at < offset + length; at += 4) {
        const word = [0, 1, 2, 3].reduce(
          (value, shift) => value * 256 + (sfnt[at + shift] ?? 0),
          0,
        );
        sum = (sum + word) >>> 0;
      }
      expect(sum).toBe(view.getUint32(entry + 4));
    }
    expect(tags).toEqual(expect.arrayContaining(["cmap", "glyf", "head", "name", "OS/2"]));
    await expect(woffToSfnt(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });

  it("critère 4 : les polices sont embarquées dans le .docx, avec le gras et l'italique", async () => {
    const regular = await woffToSfnt(
      new Uint8Array(
        readFileSync(
          new URL(
            "../../node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff",
            import.meta.url,
          ),
        ),
      ),
    );
    const bold = await woffToSfnt(
      new Uint8Array(
        readFileSync(
          new URL(
            "../../node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-700-normal.woff",
            import.meta.url,
          ),
        ),
      ),
    );
    const { files, text } = await exportOf(doc(para("Garamond")), {
      fonts: [{ name: "EB Garamond", regular, bold }],
    });
    expect(
      files.filter((file) => file.startsWith("word/fonts/") && !file.endsWith("/")),
    ).toHaveLength(2);
    const fontTable = await text("word/fontTable.xml");
    expect(fontTable).toContain('w:name="EB Garamond"');
    expect(fontTable).toContain("<w:embedRegular");
    expect(fontTable).toContain("<w:embedBold");
    expect(await text("word/settings.xml")).toContain("<w:embedTrueTypeFonts");
  });

  it("critère 5 : un document vide, très long, avec accents et emojis s'exporte sans erreur", async () => {
    const empty = await exportOf(doc());
    expect(await empty.text("word/document.xml")).toContain("<w:body>");
    const long = doc(
      ...Array.from({ length: 3000 }, (_, index) =>
        para(`Ligne ${index} : Noël, œuvre, l'île 👨‍👩‍👧 🇫🇷 😀`),
      ),
    );
    const { text } = await exportOf(long);
    const body = await text("word/document.xml");
    expect(body).toContain("Ligne 2999 : Noël, œuvre, l&apos;île 👨‍👩‍👧 🇫🇷 😀");
  }, 30_000);

  it("les dimensions d'une image se lisent dans son en-tête (PNG, GIF, JPEG, WebP)", () => {
    expect(imageSize(TINY_PNG, "image/png")).toEqual({ width: 1, height: 1 });
    const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x03, 0x58, 0x02]);
    expect(imageSize(gif, "image/gif")).toEqual({ width: 800, height: 600 });
    const jpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58,
      0x03, 0x20, 0x03,
    ]);
    expect(imageSize(jpeg, "image/jpeg")).toEqual({ width: 800, height: 600 });
    const vp8x = new Uint8Array(30);
    vp8x.set([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8X")]);
    vp8x.set([0x1f, 0x03, 0x00, 0x57, 0x02, 0x00], 24);
    expect(imageSize(vp8x, "image/webp")).toEqual({ width: 800, height: 600 });
    expect(imageSize(fakePng(1, 4).data, "image/png")).toBeNull();
    expect(imageSize(new Uint8Array(3), "image/jpeg")).toBeNull();
  });

  it("critère 6 : l'export ne passe pas par le réseau", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => {
      calls += 1;
      return Promise.reject(new Error("réseau interdit"));
    }) as typeof fetch;
    try {
      await exportOf(doc(para("Secret de famille")));
    } finally {
      globalThis.fetch = original;
    }
    expect(calls).toBe(0);
  });
});
