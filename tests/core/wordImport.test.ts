// @vitest-environment jsdom
// Ouverture d'un fichier Word (T2.18) : conversion des fichiers d'exemple de tests/fixtures/word/ (faits par
// python-docx à partir du modèle de Word, et par LibreOffice), refus clairs, éléments signalés, identifiants neufs.
// Le XML est analysé par le DOMParser de jsdom, comme le fera celui du navigateur.
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { contentOf } from "../../src/core/fileFormat";
import { readHeaderFooter } from "../../src/core/headerFooter";
import { readImage, type StoredImage } from "../../src/core/images";
import { readPageSetup } from "../../src/core/pageSetup";
import { BLOCK_TYPES_WITH_ID } from "../../src/core/schema";
import type { DocumentJson } from "../../src/core/types";
import { exportWord } from "../../src/core/wordExport";
import {
  readWordFile,
  WORD_ERROR_MESSAGES,
  wordDocument,
  wordOpenNotice,
  type WordConversion,
} from "../../src/core/wordImport";
import { isWordFileName, nanoNameOf } from "../../src/core/wordFiles";
import {
  fontSizeOf,
  indentOf,
  lineHeightOf,
  nearestFont,
  nearestHighlight,
  nearestTextColor,
} from "../../src/core/wordImportStyles";
import { fakePng } from "./imageHelpers";

const parser = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(`tests/fixtures/word/${name}`));
}

async function convert(bytes: Uint8Array): Promise<WordConversion> {
  const result = await readWordFile(bytes, parser);
  if (!result.ok) throw new Error(`refusé : ${result.error}`);
  return result.conversion;
}

/** Images « préparées » telles quelles (la réduction est faite par le navigateur, src/editor/imageImport.ts). */
function asIs(conversion: WordConversion): Map<string, StoredImage> {
  return new Map(
    [...conversion.images].map(([key, data]) => [key, { type: "image/png" as const, data }]),
  );
}

/** Texte brut d'un nœud. */
function plain(node: DocumentJson): string {
  return node.text ?? (node.content ?? []).map(plain).join("");
}

/** Nœuds d'un type, à toute profondeur. */
function all(node: DocumentJson, type: string): DocumentJson[] {
  return [
    ...(node.type === type ? [node] : []),
    ...(node.content ?? []).flatMap((child) => all(child, type)),
  ];
}

/** Morceau de texte qui contient `text`. */
function run(doc: DocumentJson, text: string): DocumentJson {
  const found = all(doc, "text").find((node) => node.text?.includes(text));
  if (!found) throw new Error(`texte absent : ${text}`);
  return found;
}

function markOf(node: DocumentJson, type: string) {
  return node.marks?.find((mark) => mark.type === type);
}

/** Fichier .docx minimal à partir du XML de son corps. */
async function docx(body: string, extra: Record<string, string> = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}</w:body></w:document>`,
  );
  for (const [path, text] of Object.entries(extra)) zip.file(path, text);
  return zip.generateAsync({ type: "uint8array" });
}

describe("T2.18 critère 1 : le fichier Word devient un nouveau document, jamais modifié", () => {
  it("critère 1 : un nouveau document, avec un nouvel id, sans fichier courant, nommé comme le fichier Word en .nano", async () => {
    const bytes = fixture("complet.docx");
    const before = bytes.slice();
    const conversion = await convert(bytes);
    const first = wordDocument(conversion, asIs(conversion), "Rapport.docx").document;
    const second = wordDocument(conversion, asIs(conversion), "Rapport.docx").document;
    expect(first.id).not.toBe(second.id);
    expect(first.ydoc).not.toBe(second.ydoc);
    expect(first.fileName).toBeNull();
    expect(first.savedSnapshot).toBeNull();
    expect(first.suggestedName).toBe("Rapport.nano");
    expect(bytes).toEqual(before);
  });

  it("critère 1 : le nom proposé remplace .docx par .nano, accents et espaces gardés", () => {
    expect(nanoNameOf("Lettre à Mamie.docx")).toBe("Lettre à Mamie.nano");
    expect(nanoNameOf("Modèle.DOTX")).toBe("Modèle.nano");
    expect(nanoNameOf(".docx")).toBe("document.nano");
  });

  it("critère 1 : « Ouvrir… » reconnaît les fichiers Word à leur nom", () => {
    expect(isWordFileName("a.docx")).toBe(true);
    expect(isWordFileName("a.DOCX")).toBe(true);
    expect(isWordFileName("a.doc")).toBe(true);
    expect(isWordFileName("a.odt")).toBe(true);
    expect(isWordFileName("a.nano")).toBe(false);
  });
});

describe("T2.18 critère 2 : ce qui est repris d'un fichier de Word", () => {
  it("critère 2 : titres 1 à 3, paragraphes, accents et emojis", async () => {
    const { content } = await convert(fixture("complet.docx"));
    expect(all(content, "heading").map((node) => [node.attrs?.level, plain(node)])).toEqual([
      [1, "Titre principal"],
      [2, "Sous-titre"],
      [3, "Section"],
    ]);
    expect(plain(content)).toContain("accents éèàçù, emoji 😀");
  });

  it("critère 2 : gras, italique, souligné, barré, couleur, surlignage, exposant et indice", async () => {
    const { content } = await convert(fixture("complet.docx"));
    expect(markOf(run(content, "gras"), "bold")).toBeDefined();
    expect(markOf(run(content, "italique"), "italic")).toBeDefined();
    expect(markOf(run(content, "souligné"), "underline")).toBeDefined();
    expect(markOf(run(content, "barré"), "strike")).toBeDefined();
    // Rouge vif de Word ramené au rouge de la palette.
    expect(markOf(run(content, "rouge"), "textStyle")?.attrs?.color).toBe("#C62828");
    expect(markOf(run(content, "surligné"), "highlight")?.attrs?.color).toBe("#FFF176");
    const subscript = all(content, "text").find((node) => markOf(node, "subscript"));
    const superscript = all(content, "text").find((node) => markOf(node, "superscript"));
    expect(subscript?.text).toBe("2");
    expect(superscript?.text).toBe("2");
  });

  it("critère 2 : police intégrée la plus proche et taille", async () => {
    const { content } = await convert(fixture("complet.docx"));
    const font = (text: string) => markOf(run(content, text), "textStyle")?.attrs?.fontFamily;
    expect(font("Times")).toBe("IBM Plex Serif");
    expect(font("Courier")).toBe("IBM Plex Mono");
    expect(font("Garamond")).toBe("EB Garamond");
    expect(font("Arial")).toBeNull();
    expect(markOf(run(content, "grand"), "textStyle")?.attrs?.fontSize).toBe("18pt");
  });

  it("critère 2 : polices rapprochées par famille, la police par défaut n'est pas écrite", () => {
    expect(nearestFont("Calibri")).toBeNull();
    expect(nearestFont("Aptos")).toBeNull();
    expect(nearestFont("Georgia")).toBe("IBM Plex Serif");
    expect(nearestFont("Cambria")).toBe("IBM Plex Serif");
    expect(nearestFont("Book Antiqua")).toBe("EB Garamond");
    expect(nearestFont("Consolas")).toBe("IBM Plex Mono");
    expect(nearestFont("Source Sans Pro")).toBe("Source Sans 3");
    expect(nearestFont("eb garamond")).toBe("EB Garamond");
    expect(nearestFont("Comic Sans MS")).toBeNull();
    expect(fontSizeOf(24)).toBeNull();
    expect(fontSizeOf(21)).toBe("10.5pt");
  });

  it("critère 2 : couleur et surlignage ramenés à la palette, noir et automatique sans couleur", () => {
    expect(nearestTextColor("auto")).toBeNull();
    expect(nearestTextColor("000000")).toBeNull();
    expect(nearestTextColor("2F5496")).toBe("#1565C0");
    expect(nearestTextColor("00B050")).toBe("#2E7D32");
    expect(nearestTextColor("7030A0")).toBe("#6A1B9A");
    expect(nearestTextColor("808080")).toBe("#6B6B68");
    expect(nearestHighlight({ highlight: "cyan" })).toBe("#B3E5FC");
    expect(nearestHighlight({ highlight: "magenta" })).toBe("#F8BBD0");
    expect(nearestHighlight({ shading: "#FFFF00" })).toBe("#FFF176");
    expect(nearestHighlight({ shading: "#D9D9D9" })).toBeNull();
    expect(nearestHighlight({})).toBeNull();
  });

  it("critère 2 : alignement, interligne et retrait", async () => {
    const { content } = await convert(fixture("complet.docx"));
    const block = (text: string) =>
      all(content, "paragraph").find((node) => plain(node) === text)?.attrs ?? {};
    expect(block("Centré").textAlign).toBe("center");
    expect(block("À droite").textAlign).toBe("right");
    expect(block("Justifié").textAlign).toBe("justify");
    expect(block("Double interligne").lineHeight).toBe("2");
    expect(block("Retrait de 2,5 cm").indent).toBe(2);
    expect(lineHeightOf(259, "auto")).toBe("1.15");
    expect(lineHeightOf(330, "auto")).toBeNull();
    expect(lineHeightOf(360, "exact")).toBeNull();
    expect(indentOf(-200)).toBe(0);
    expect(indentOf(100_000)).toBe(5);
  });

  it("critère 2 : listes à puces et numérotées, avec leurs niveaux", async () => {
    const lists = await convert(
      await docx(
        ["Un:0:1", "Un a:1:1", "Un a i:2:1", "Deux:0:1", "Trois:0:2"]
          .map((entry) => {
            const [text, level, num] = entry.split(":");
            return `<w:p><w:pPr><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${num}"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
          })
          .join(""),
        {
          "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`,
          "word/numbering.xml": `<?xml version="1.0"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="decimal"/></w:lvl><w:lvl w:ilvl="2"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`,
        },
      ),
    );
    const [bullets, numbers] = lists.content.content ?? [];
    expect(bullets?.type).toBe("bulletList");
    expect(bullets?.content?.map(plain)).toEqual(["UnUn aUn a i", "Deux"]);
    const nested = bullets?.content?.[0]?.content?.[1];
    expect(nested?.type).toBe("orderedList");
    expect(nested?.content?.[0]?.content?.[1]?.type).toBe("bulletList");
    expect(numbers?.type).toBe("orderedList");
  });

  it("critère 2 : une liste numérotée coupée par un paragraphe continue sa numérotation, comme dans Word", async () => {
    const item = (text: string) =>
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
    const { content } = await convert(
      await docx(
        `${item("un")}${item("deux")}<w:p><w:r><w:t>entre</w:t></w:r></w:p>${item("trois")}`,
        {
          "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`,
          "word/numbering.xml": `<?xml version="1.0"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
        },
      ),
    );
    const lists = all(content, "orderedList");
    expect(lists).toHaveLength(2);
    expect(lists[1]?.attrs?.start).toBe(3);
  });

  it("critère 2 : tableau avec sa ligne d'en-tête, cellules fusionnées séparées", async () => {
    const conversion = await convert(fixture("complet.docx"));
    const [table] = all(conversion.content, "table");
    const rows = table?.content ?? [];
    expect(rows.map((row) => row.content?.map(plain))).toEqual([
      ["Nom", "Âge", "Ville"],
      ["Élodie", "12", "Lyon"],
      ["Fusionnée", "", ""],
    ]);
    expect(rows[0]?.content?.every((cell) => cell.type === "tableHeader")).toBe(true);
    expect(conversion.skipped.has("mergedCells")).toBe(true);
  });

  it("critère 2 : image gardée, à sa taille dans Word, rangée dans le Y.Doc sous son empreinte", async () => {
    const conversion = await convert(fixture("complet.docx"));
    const { document } = wordDocument(conversion, asIs(conversion), "a.docx");
    const [image] = all(contentOf(document.ydoc), "image");
    // 8 cm à 96 pixels par pouce.
    expect(image?.attrs?.width).toBe(302);
    expect(readImage(document.ydoc, String(image?.attrs?.hash))).not.toBeNull();
  });

  it("critère 2 : une image refusée à la préparation est retirée et signalée", async () => {
    const conversion = await convert(fixture("complet.docx"));
    const refused = new Map([...conversion.images.keys()].map((key) => [key, null]));
    const { document, skipped } = wordDocument(conversion, refused, "a.docx");
    expect(all(contentOf(document.ydoc), "image")).toHaveLength(0);
    expect(skipped.has("refusedImages")).toBe(true);
    expect(skipped.has("unsupportedImages")).toBe(false);
    expect(wordOpenNotice("a.docx", skipped, false)).toContain(
      "les images trop lourdes ou illisibles",
    );
  });

  it("critère 2 : liens, saut de page", async () => {
    const { content } = await convert(fixture("complet.docx"));
    expect(markOf(run(content, "le site"), "link")?.attrs?.href).toBe("https://example.org/");
    // Le bleu et le soulignement du lien de Word viennent du lien de Nano Buro.
    expect(markOf(run(content, "le site"), "underline")).toBeUndefined();
    const blocks = content.content ?? [];
    const breakIndex = blocks.findIndex((node) => node.type === "pageBreak");
    expect(plain(blocks[breakIndex - 1] as DocumentJson)).toBe("Avant le saut");
    expect(plain(blocks[breakIndex + 1] as DocumentJson)).toContain("Après le saut");
  });

  it("critère 2 : page Lettre US en paysage ramenée à A4, marges, en-tête et numéro de page", async () => {
    const conversion = await convert(fixture("complet.docx"));
    const { document } = wordDocument(conversion, asIs(conversion), "a.docx");
    expect(readPageSetup(document.ydoc)).toEqual({
      orientation: "landscape",
      margins: { top: 2, bottom: 2, left: 3, right: 3 },
    });
    const margins = readHeaderFooter(document.ydoc);
    expect(margins.header).toEqual({ text: "Famille Martin", align: "left" });
    expect(margins.pageNumbers).toEqual({ position: "right", skipFirst: false });
  });

  it("critère 2 : un fichier enregistré par LibreOffice se lit aussi", async () => {
    const { content } = await convert(fixture("libreoffice.docx"));
    expect(all(content, "heading").map(plain)).toEqual([
      "Titre principal",
      "Sous-titre",
      "Section",
    ]);
    expect(all(content, "bulletList").length).toBeGreaterThan(0);
    expect(all(content, "orderedList").length).toBeGreaterThan(0);
    expect(all(content, "table")).toHaveLength(1);
    expect(all(content, "image")).toHaveLength(1);
    expect(all(content, "pageBreak")).toHaveLength(1);
  });

  it("critère 2 : un document vide garde un paragraphe vide", async () => {
    const { content } = await convert(await docx(""));
    expect(content.content).toEqual([{ type: "paragraph", attrs: { id: expect.any(String) } }]);
  });

  it("critère 2 : un retour à la ligne de Word coupe le paragraphe, lignes vides gardées", async () => {
    const { content } = await convert(
      await docx(`<w:p><w:r><w:t>un</w:t><w:br/><w:br/><w:t>deux</w:t></w:r></w:p>`),
    );
    expect(content.content?.map(plain)).toEqual(["un", "", "deux"]);
  });

  it("critère 2 : un sommaire de Word devient le sommaire de Nano Buro, sans ses lignes ni son titre", async () => {
    const { content } = await convert(
      await docx(
        `<w:p><w:r><w:t>Table des matières</w:t></w:r></w:p>` +
          `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> TOC \\o "1-3" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Introduction 1</w:t></w:r></w:p>` +
          `<w:p><w:r><w:t>Suite 2</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>` +
          `<w:p><w:r><w:t>Texte</w:t></w:r></w:p>`,
      ),
    );
    expect(content.content?.map((node) => node.type)).toEqual(["tableOfContents", "paragraph"]);
    expect(plain(content)).toBe("Texte");
  });

  it("critère 2 : un texte très long se lit en entier", async () => {
    const long = "Œuvre très longue ".repeat(20_000);
    const { content } = await convert(
      await docx(`<w:p><w:r><w:t xml:space="preserve">${long}</w:t></w:r></w:p>`),
    );
    expect(plain(content)).toBe(long);
  });
});

describe("T2.18 critère 3 : ce qui n'est pas repris est signalé", () => {
  it("critère 3 : commentaires, notes, zones de texte et champs signalés ; suivi des modifications accepté", async () => {
    const conversion = await convert(fixture("elements-non-repris.docx"));
    expect([...conversion.skipped].sort()).toEqual([
      "comments",
      "fields",
      "footnotes",
      "textBoxes",
    ]);
    expect(conversion.trackedChanges).toBe(true);
    const text = plain(conversion.content);
    expect(text).toContain("Texte ajouté");
    expect(text).not.toContain("retiré");
    expect(text).toContain("Date : 01/01/2026");
  });

  it("critère 3 : le message liste les éléments et dit que les modifications suivies sont acceptées", async () => {
    const conversion = await convert(fixture("elements-non-repris.docx"));
    const notice = wordOpenNotice("Lettre.docx", conversion.skipped, conversion.trackedChanges);
    expect(notice).toBe(
      "« Lettre.docx » a été ouvert comme un nouveau document Nano Buro ; le fichier Word n'est pas modifié. " +
        "Certains éléments n'ont pas pu être repris : les commentaires, les notes de bas de page et de fin, " +
        "les zones de texte, les champs (dates, renvois…), remplacés par leur texte. " +
        "Le suivi des modifications a été lu avec toutes les modifications acceptées.",
    );
  });

  it("critère 3 : sans élément manquant, le message dit seulement que le fichier Word n'est pas modifié", () => {
    expect(wordOpenNotice("a.docx", new Set(), false)).toBe(
      "« a.docx » a été ouvert comme un nouveau document Nano Buro ; le fichier Word n'est pas modifié.",
    );
  });
});

describe("T2.18 critère 4 : fichier protégé, abîmé ou d'un autre format", () => {
  for (const [name, error] of [
    ["protege.docx", "protected"],
    ["ancien.doc", "old-word"],
    ["document.odt", "opendocument"],
  ] as const) {
    it(`critère 4 : « ${name} » est refusé avec un message clair`, async () => {
      expect(await readWordFile(fixture(name), parser)).toEqual({ ok: false, error });
      expect(WORD_ERROR_MESSAGES[error]).toMatch(/Il n'a pas été modifié\.$/);
    });
  }

  it("critère 4 : une archive coupée, des octets au hasard, une archive sans document ou un XML abîmé sont « abîmés »", async () => {
    const complete = fixture("complet.docx");
    const cases = [
      complete.slice(0, complete.length / 2),
      new Uint8Array([1, 2, 3, 4, 5]),
      new Uint8Array(0),
      await new JSZip().file("autre.txt", "x").generateAsync({ type: "uint8array" }),
      await new JSZip()
        .file("word/document.xml", "<w:document><w:body>")
        .generateAsync({ type: "uint8array" }),
      await new JSZip()
        .file("word/document.xml", '<!DOCTYPE x [<!ENTITY a "aaaa">]><w:document/>')
        .generateAsync({ type: "uint8array" }),
    ];
    for (const bytes of cases) {
      expect(await readWordFile(bytes, parser)).toEqual({ ok: false, error: "damaged" });
    }
  });
});

describe("T2.18 critère 5 : rapidité", () => {
  it("critère 5 : un fichier de 50 pages avec 20 images s'ouvre en quelques secondes", async () => {
    const images = new Map(
      Array.from({ length: 20 }, (_, index) => {
        const image = fakePng(index + 1, 50_000);
        return [
          `h${String(index)}`,
          { type: "png" as const, data: image.data, width: 800, height: 600 },
        ];
      }),
    );
    const content: DocumentJson = {
      type: "doc",
      content: Array.from({ length: 1000 }, (_, index) =>
        index % 50 === 0
          ? {
              type: "image",
              attrs: { hash: `h${String(index / 50)}`, alt: "", width: null, textAlign: null },
            }
          : {
              type: "paragraph",
              content: [{ type: "text", text: `Paragraphe ${String(index)} : du texte accentué.` }],
            },
      ),
    };
    const bytes = await exportWord({
      content,
      pageSetup: readPageSetup(new (await import("yjs")).Doc()),
      images,
      fonts: [],
    });
    const start = performance.now();
    const conversion = await convert(bytes);
    wordDocument(conversion, asIs(conversion), "long.docx");
    expect(performance.now() - start).toBeLessThan(5000);
    expect(all(conversion.content, "image")).toHaveLength(20);
  });
});

describe("T2.18 critère 6 : identifiants neufs", () => {
  it("critère 6 : chaque bloc reçoit un identifiant neuf et unique, différent à chaque ouverture", async () => {
    const ids = async () => {
      const { content } = await convert(fixture("complet.docx"));
      return BLOCK_TYPES_WITH_ID.flatMap((type) =>
        all(content, type).map((node) => node.attrs?.id),
      );
    };
    const first = await ids();
    const second = await ids();
    expect(first.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(first).size).toBe(first.length);
    expect(first.some((id) => second.includes(id))).toBe(false);
  });
});
