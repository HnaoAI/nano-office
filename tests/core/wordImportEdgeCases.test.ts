// @vitest-environment jsdom
// Ouverture d'un fichier Word (T2.18) : cas limites relevés à la relecture. Numérotation qui ne commence pas à 1,
// lignes de tableau dans un contrôle de contenu ou supprimées par le suivi des modifications, champ jamais fermé,
// en-tête hérité d'une section précédente, archive qui annonce une partie démesurée.
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { DocumentJson } from "../../src/core/types";
import { MAX_PART_BYTES, readWordFile, type WordConversion } from "../../src/core/wordImport";

const parser = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** Fichier .docx minimal : corps, parties supplémentaires et relations du document (id → [type, cible]). */
async function docx(
  body: string,
  parts: Record<string, string | Uint8Array> = {},
  rels: Record<string, [string, string]> = {},
): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document ${NS}><w:body>${body}</w:body></w:document>`,
  );
  const relations = Object.entries(rels)
    .map(
      ([id, [type, target]]) =>
        `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`,
    )
    .join("");
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relations}</Relationships>`,
  );
  for (const [path, text] of Object.entries(parts)) zip.file(path, text);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

async function convert(bytes: Uint8Array): Promise<WordConversion> {
  const result = await readWordFile(bytes, parser);
  if (!result.ok) throw new Error(`refusé : ${result.error}`);
  return result.conversion;
}

function plain(node: DocumentJson): string {
  return node.text ?? (node.content ?? []).map(plain).join("");
}

function all(node: DocumentJson, type: string): DocumentJson[] {
  return [
    ...(node.type === type ? [node] : []),
    ...(node.content ?? []).flatMap((child) => all(child, type)),
  ];
}

const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const cell = (text: string) => `<w:tc>${p(text)}</w:tc>`;
const header = (text: string) => `<?xml version="1.0"?><w:hdr ${NS}>${p(text)}</w:hdr>`;

describe("T2.18 critère 2 : cas limites des listes et des tableaux", () => {
  it("critère 2 : une liste numérotée qui commence à 5 dans Word commence à 5", async () => {
    const numbering = `<?xml version="1.0"?><w:numbering ${NS}>
      <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="5"/><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
      <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
      <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
      <w:num w:numId="2"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="3"/></w:lvlOverride></w:num>
    </w:numbering>`;
    const item = (numId: number, text: string) =>
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
    const { content } = await convert(
      await docx(
        item(1, "cinq") + item(1, "six") + p("coupure") + item(2, "trois"),
        { "word/numbering.xml": numbering },
        { rId1: ["numbering", "numbering.xml"] },
      ),
    );
    const lists = all(content, "orderedList");
    expect(lists.map((list) => list.attrs?.start ?? 1)).toEqual([5, 3]);
    expect(lists.map(plain)).toEqual(["cinqsix", "trois"]);
  });

  it("critère 2 : les lignes et cellules d'un contrôle de contenu sont gardées", async () => {
    const { content } = await convert(
      await docx(
        `<w:tbl><w:tr>${cell("a")}${cell("b")}</w:tr><w:sdt><w:sdtContent><w:tr>${cell("c")}<w:sdt><w:sdtContent>${cell("d")}</w:sdtContent></w:sdt></w:tr></w:sdtContent></w:sdt></w:tbl>`,
      ),
    );
    const rows = all(content, "tableRow");
    expect(rows.map((row) => (row.content ?? []).map(plain))).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("critère 3 : une ligne supprimée par le suivi des modifications est retirée, la suppression acceptée", async () => {
    const conversion = await convert(
      await docx(
        `<w:tbl><w:tr>${cell("gardée")}</w:tr><w:tr><w:trPr><w:del w:id="1" w:author="A" w:date="2026-01-01T00:00:00Z"/></w:trPr>${cell("supprimée")}</w:tr></w:tbl>`,
      ),
    );
    expect(plain(conversion.content)).toBe("gardée");
    expect(conversion.trackedChanges).toBe(true);
  });
});

describe("T2.18 critère 3 : champs et en-têtes difficiles", () => {
  it("critère 3 : un champ jamais fermé ne masque pas la suite du document, et il est signalé", async () => {
    const conversion = await convert(
      await docx(
        `<w:p><w:r><w:t>avant </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>DATE</w:instrText></w:r></w:p>${p("après")}`,
      ),
    );
    expect(plain(conversion.content)).toContain("avant");
    expect(plain(conversion.content)).toContain("après");
    expect(conversion.skipped.has("fields")).toBe(true);
  });

  it("critère 2 : l'en-tête d'une section précédente est repris par la dernière section, comme dans Word", async () => {
    const conversion = await convert(
      await docx(
        `${p("un")}<w:p><w:pPr><w:sectPr><w:headerReference w:type="default" r:id="rH"/></w:sectPr></w:pPr></w:p>${p("deux")}<w:sectPr/>`,
        { "word/header1.xml": header("Famille Martin") },
        { rH: ["header", "header1.xml"] },
      ),
    );
    expect(conversion.content.attrs?.pageHeader).toMatchObject({ text: "Famille Martin" });
    expect(conversion.skipped.has("headerFooter")).toBe(false);
  });

  it("critère 3 : des sections aux en-têtes différents sont signalées", async () => {
    const conversion = await convert(
      await docx(
        `${p("un")}<w:p><w:pPr><w:sectPr><w:headerReference w:type="default" r:id="rA"/></w:sectPr></w:pPr></w:p>${p("deux")}<w:sectPr><w:headerReference w:type="default" r:id="rB"/></w:sectPr>`,
        { "word/header1.xml": header("Premier"), "word/header2.xml": header("Second") },
        { rA: ["header", "header1.xml"], rB: ["header", "header2.xml"] },
      ),
    );
    expect(conversion.content.attrs?.pageHeader).toMatchObject({ text: "Second" });
    expect(conversion.skipped.has("headerFooter")).toBe(true);
  });
});

describe("T2.18 critère 4 : archive piégée", () => {
  it("critère 4 : une partie qui dépasse la taille permise rend le fichier « abîmé », sans être lue", async () => {
    // Une image de zéros : quelques centaines de kilo-octets compressés, plus de 100 Mo une fois lue.
    // Lue sans limite, elle donnerait un document ouvert ; la limite la refuse avant de la décompresser.
    const bytes = await docx(
      p("texte"),
      { "word/media/image1.png": new Uint8Array(MAX_PART_BYTES + 1) },
      { rId1: ["image", "media/image1.png"] },
    );
    expect(bytes.length).toBeLessThan(MAX_PART_BYTES / 100);
    const result = await readWordFile(bytes, parser);
    expect(result).toEqual({ ok: false, error: "damaged" });
  });
});
