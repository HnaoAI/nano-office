// Sommaire automatique (T2.17) : lignes (Titre 1 à 3 du document), ancres et signets, bloc gardé dans le
// fichier `.nano` avec son identifiant sans changement de version, hors du compte des mots, et champ de
// table des matières de Word avec ses numéros de page.
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { hasUnsavedChanges } from "../../src/core/documentFile";
import { contentOf, parseDocument, serializeDocument } from "../../src/core/fileFormat";
import { DEFAULT_PAGE_SETUP } from "../../src/core/pageSetup";
import { documentSchema } from "../../src/core/schema";
import {
  EMPTY_TOC_HEADING,
  tocAnchor,
  tocEntries,
  tocEntriesFromJson,
  tocLineText,
  wordBookmark,
} from "../../src/core/toc";
import { NANO_FORMAT_VERSION, type DocumentJson } from "../../src/core/types";
import { nodeStats } from "../../src/core/wordCount";
import { exportWord } from "../../src/core/wordExport";
import { ydocFromJson } from "./helpers";

function heading(id: string, level: number, text: string): DocumentJson {
  return { type: "heading", attrs: { id, level }, content: text ? [{ type: "text", text }] : [] };
}

function para(id: string, text: string): DocumentJson {
  return { type: "paragraph", attrs: { id }, content: [{ type: "text", text }] };
}

const TOC: DocumentJson = { type: "tableOfContents", attrs: { id: "toc-1" } };

/** Rapport : un sommaire, trois niveaux de titres, un titre dans un tableau et dans un encadré. */
const REPORT: DocumentJson = {
  type: "doc",
  content: [
    para("p-0", "Rapport sur le vent"),
    TOC,
    heading("h-1", 1, "Introduction"),
    para("p-1", "Le vent souffle 🌬️."),
    heading("h-2", 2, "Le vent d'été"),
    heading("h-3", 3, "Les cerfs-volants de Zoé"),
    {
      type: "callout",
      attrs: { id: "c-1", calloutStyle: "border" },
      content: [heading("h-c", 2, "Titre encadré")],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              attrs: { id: "td-1" },
              content: [heading("h-t", 1, "Dans un tableau")],
            },
          ],
        },
      ],
    },
    heading("h-4", 1, ""),
  ],
};

function docNode(json: DocumentJson) {
  return documentSchema.nodeFromJSON(json);
}

describe("T2.17 : sommaire automatique", () => {
  it("critère 2 : le sommaire liste les Titre 1 à 3 du document, dans l'ordre, avec leur niveau", () => {
    const entries = tocEntries(docNode(REPORT));
    expect(entries.map(({ id, level, text }) => [id, level, text])).toEqual([
      ["h-1", 1, "Introduction"],
      ["h-2", 2, "Le vent d'été"],
      ["h-3", 3, "Les cerfs-volants de Zoé"],
      ["h-4", 1, ""],
    ]);
    // Même lignes depuis le JSON, pour l'export Word.
    expect(tocEntriesFromJson(REPORT)).toEqual(entries);
  });

  it("critère 2 : un titre sans texte reste une ligne visible", () => {
    expect(tocLineText({ text: "" })).toBe(EMPTY_TOC_HEADING);
    expect(tocLineText({ text: "  " })).toBe(EMPTY_TOC_HEADING);
    expect(tocLineText({ text: "Été 😀" })).toBe("Été 😀");
  });

  it("critère 2 : un document sans titre a un sommaire vide", () => {
    expect(tocEntries(docNode({ type: "doc", content: [TOC, para("p", "Texte")] }))).toEqual([]);
  });

  it("critère 3 : le sommaire ne fait jamais partie du compte des mots", () => {
    const withToc = nodeStats(docNode(REPORT));
    const without = nodeStats(
      docNode({ ...REPORT, content: (REPORT.content ?? []).filter((block) => block !== TOC) }),
    );
    expect(withToc).toEqual(without);
  });

  it("critère 4 : c'est un bloc du document avec son identifiant, jamais dans une liste, un tableau ou un encadré", () => {
    const type = documentSchema.nodes.tableOfContents;
    expect(type).toBeDefined();
    if (!type) return;
    expect(type.isAtom).toBe(true);
    expect(type.isBlock).toBe(true);
    expect(type.spec.attrs ?? {}).toHaveProperty("id");
    expect(documentSchema.nodes.doc?.contentMatch.matchType(type)).toBeTruthy();
    expect(documentSchema.nodes.listItem?.contentMatch.matchType(type)).toBeFalsy();
    expect(documentSchema.nodes.tableCell?.contentMatch.matchType(type)).toBeFalsy();
    expect(documentSchema.nodes.callout?.contentMatch.matchType(type)).toBeFalsy();
  });

  it("critère 4 : le sommaire et son identifiant sont gardés dans le fichier, sans changer la version", () => {
    const ydoc = ydocFromJson(REPORT);
    const file = JSON.parse(serializeDocument({ id: "doc-1", ydoc })) as {
      version: number;
      content: DocumentJson;
    };
    expect(file.version).toBe(NANO_FORMAT_VERSION);
    expect(file.content.content?.[1]).toEqual(TOC);
    const result = parseDocument(JSON.stringify(file));
    if (!result.ok) throw new Error(result.error);
    expect(contentOf(result.ydoc).content?.[1]).toEqual(TOC);
  });

  it("critère 4 : un sommaire seul compte comme une modification à enregistrer", () => {
    const ydoc = ydocFromJson({ type: "doc", content: [TOC] });
    expect(hasUnsavedChanges({ id: "d", ydoc, fileName: null, savedSnapshot: null })).toBe(true);
  });

  it("critère 5 : chaque titre a une ancre pour les liens du PDF, et un signet de Word de 40 caractères au plus", () => {
    expect(tocAnchor("h-1")).toBe("titre-h-1");
    expect(tocAnchor('a"b<c> d')).toBe("titre-abcd");
    const id = crypto.randomUUID();
    expect(wordBookmark(id)).toMatch(/^_Toc[0-9a-f]{32}$/);
    expect(wordBookmark(id).length).toBeLessThanOrEqual(40);
  });

  it("critère 5 : dans l'export Word, un champ de table des matières écrit avec ses lignes et ses numéros", async () => {
    const bytes = await exportWord({
      content: REPORT,
      pageSetup: DEFAULT_PAGE_SETUP,
      images: new Map(),
      fonts: [],
      tocPages: new Map([
        ["h-1", 2],
        ["h-2", 2],
        ["h-3", 3],
      ]),
    });
    const zip = await JSZip.loadAsync(bytes);
    const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
    const styles = (await zip.file("word/styles.xml")?.async("string")) ?? "";
    // Champ que Word sait mettre à jour, avec des liens vers les titres.
    expect(xml).toContain("TOC \\h \\o &quot;1-3&quot;");
    expect(xml).toContain('w:dirty="false"');
    expect(xml).toContain(">Sommaire<");
    // Lignes écrites avec leurs numéros, liées au signet de leur titre.
    expect(xml).toMatch(/w:anchor="_Toch1".*?Introduction<\/w:t><w:tab\/><w:t[^>]*>2</);
    expect(xml).toMatch(/Les cerfs-volants de Zoé<\/w:t><w:tab\/><w:t[^>]*>3</);
    expect(xml).toContain(`>${EMPTY_TOC_HEADING}<`);
    expect(xml).toContain('<w:bookmarkStart w:name="_Toch1"');
    expect(xml).not.toContain("_Tocht");
    // Styles des lignes, en retrait selon le niveau.
    expect(styles).toContain('w:styleId="TOC2"');
    expect(styles).toContain('w:styleId="TOC3"');
  });

  it("critère 5 : sans sommaire, l'export Word n'a ni champ ni signet", async () => {
    const bytes = await exportWord({
      content: { type: "doc", content: [heading("h-1", 1, "Titre")] },
      pageSetup: DEFAULT_PAGE_SETUP,
      images: new Map(),
      fonts: [],
    });
    const zip = await JSZip.loadAsync(bytes);
    const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
    expect(xml).not.toContain("TOC \\h");
    expect(xml).not.toContain("bookmarkStart");
  });
});
