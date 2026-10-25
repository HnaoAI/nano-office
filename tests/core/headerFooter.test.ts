// Numéros de page (T2.15), en-tête et pied de page (T2.16) : réglages par défaut, attributs du nœud
// `doc`, aller-retour du format `.nano` sans changement de version, règles `@page` de l'impression,
// en-têtes et pieds de page de l'export Word.
import JSZip from "jszip";
import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { hasUnsavedChanges } from "../../src/core/documentFile";
import { parseDocument, serializeDocument } from "../../src/core/fileFormat";
import {
  cleanMarginText,
  DEFAULT_HEADER_FOOTER,
  headerFooterFromAttrs,
  marginBoxes,
  MAX_MARGIN_TEXT,
  printMarginRules,
  readHeaderFooter,
  writeHeaderFooter,
  type HeaderFooter,
} from "../../src/core/headerFooter";
import { DEFAULT_PAGE_SETUP, PAGE_SETUP_ORIGIN, readPageSetup } from "../../src/core/pageSetup";
import { NANO_FORMAT_VERSION } from "../../src/core/types";
import { exportWord } from "../../src/core/wordExport";
import { jsonFromYdoc, SAMPLE_DOCUMENT, ydocFromJson } from "./helpers";

const NUMBERED: HeaderFooter = {
  ...DEFAULT_HEADER_FOOTER,
  pageNumbers: { position: "center", skipFirst: false },
};

const FULL: HeaderFooter = {
  pageNumbers: { position: "right", skipFirst: true },
  header: { text: "Léa Martin — 3e B 😀", align: "right" },
  footer: { text: "Exposé : les volcans", align: "left" },
  skipFirst: true,
};

function reopen(ydoc: Y.Doc) {
  const result = parseDocument(serializeDocument({ id: "doc-1", ydoc }));
  if (!result.ok) throw new Error(result.error);
  return result.ydoc;
}

async function wordXml(settings: HeaderFooter) {
  const bytes = await exportWord({
    content: SAMPLE_DOCUMENT,
    pageSetup: DEFAULT_PAGE_SETUP,
    images: new Map(),
    fonts: [],
    headerFooter: settings,
  });
  const zip = await JSZip.loadAsync(bytes);
  const read = async (path: string) => (await zip.file(path)?.async("string")) ?? "";
  const parts = Object.keys(zip.files);
  const headers = await Promise.all(parts.filter((p) => /word\/header\d+\.xml$/.test(p)).map(read));
  const footers = await Promise.all(parts.filter((p) => /word\/footer\d+\.xml$/.test(p)).map(read));
  return { document: await read("word/document.xml"), headers, footers };
}

describe("T2.15 : numéros de page imprimés", () => {
  it("critère 1 : éteints par défaut ; positions en bas au centre ou à droite, première page à part", () => {
    expect(DEFAULT_HEADER_FOOTER.pageNumbers).toBeNull();
    expect(readHeaderFooter(ydocFromJson(SAMPLE_DOCUMENT))).toEqual(DEFAULT_HEADER_FOOTER);
    expect(headerFooterFromAttrs({ pageNumbers: {} }).pageNumbers).toEqual({
      position: "center",
      skipFirst: false,
    });
    expect(
      headerFooterFromAttrs({ pageNumbers: { position: "right", skipFirst: true } }).pageNumbers,
    ).toEqual({ position: "right", skipFirst: true });
  });

  it("critère 2 : à l'impression, le numéro est dans la zone de marge choisie, en IBM Plex Sans 10 pt", () => {
    const center = printMarginRules(NUMBERED);
    expect(center).toContain("@bottom-center { content: counter(page);");
    expect(center).toContain('font-family: "IBM Plex Sans"');
    expect(center).toContain("font-size: 10pt");
    expect(center).not.toContain(":first");
    const right = printMarginRules({
      ...NUMBERED,
      pageNumbers: { position: "right", skipFirst: false },
    });
    expect(right).toContain("@bottom-right { content: counter(page);");
    expect(right).not.toContain("@bottom-center");
  });

  it("critère 1 et 2 : « Pas de numéro sur la première page » efface le numéro de la page 1 seulement", () => {
    const rules = printMarginRules({
      ...NUMBERED,
      pageNumbers: { position: "center", skipFirst: true },
    });
    const [others, first] = rules.split("@page :first");
    expect(others).toContain("@bottom-center { content: counter(page);");
    expect(first).toContain("@bottom-center { content: none;");
  });

  it("critère 2 : rien n'est écrit pour un document sans numéro, sans en-tête ni pied de page", () => {
    expect(printMarginRules(DEFAULT_HEADER_FOOTER)).toBe("");
  });

  it("critère 3 : dans l'export Word, un pied de page avec le champ de numéro de page de Word", async () => {
    const { footers, document } = await wordXml(NUMBERED);
    expect(footers.some((xml) => xml.includes("PAGE"))).toBe(true);
    // Numéro au centre : après la première tabulation (centrée), avant la seconde (à droite).
    const footer = footers.find((xml) => xml.includes("PAGE")) ?? "";
    const tabs = [...footer.matchAll(/<w:tab\/>/g)].map((match) => match.index);
    const page = footer.indexOf("PAGE");
    expect(tabs[0]).toBeLessThan(page);
    expect(tabs[1]).toBeGreaterThan(page);
    expect(document).toContain("w:footerReference");
    expect(document).not.toContain("w:titlePg");
  });

  it("critère 3 : à droite et sans numéro sur la première page, aussi dans Word", async () => {
    const { footers, document } = await wordXml({
      ...NUMBERED,
      pageNumbers: { position: "right", skipFirst: true },
    });
    expect(document).toContain("w:titlePg");
    expect(footers.filter((xml) => xml.includes("PAGE"))).toHaveLength(1);
    const footer = footers.find((xml) => xml.includes("PAGE")) ?? "";
    const tabs = [...footer.matchAll(/<w:tab\/>/g)].map((match) => match.index ?? 0);
    expect(Math.max(...tabs)).toBeLessThan(footer.indexOf("PAGE"));
  });

  it("critère 3 : sans réglage, l'export Word n'a ni en-tête ni pied de page", async () => {
    const { footers, headers, document } = await wordXml(DEFAULT_HEADER_FOOTER);
    expect(footers).toEqual([]);
    expect(headers).toEqual([]);
    expect(document).not.toContain("w:footerReference");
  });

  it("critère 4 : le réglage est enregistré dans le document, avec la mise en page, sans changer la version", () => {
    const ydoc = ydocFromJson(SAMPLE_DOCUMENT);
    writeHeaderFooter(ydoc, NUMBERED);
    const file = JSON.parse(serializeDocument({ id: "doc-1", ydoc })) as Record<string, unknown>;
    expect(file.version).toBe(NANO_FORMAT_VERSION);
    expect(file.content).toEqual({
      ...jsonFromYdoc(ydoc),
      attrs: { pageNumbers: { position: "center", skipFirst: false } },
    });
    expect(readHeaderFooter(reopen(ydoc))).toEqual(NUMBERED);
  });
});

describe("T2.16 : en-tête et pied de page", () => {
  it("critère 1 : texte simple d'une ligne, avec des accents et des emojis", () => {
    expect(cleanMarginText("Léa Martin 😀")).toBe("Léa Martin 😀");
    expect(cleanMarginText("  Deux\nlignes\r\net\ttab  ")).toBe("Deux lignes et tab");
    expect(cleanMarginText("a\u0000b\u0007c")).toBe("abc");
    expect(cleanMarginText(42)).toBe("");
    expect(cleanMarginText(undefined)).toBe("");
    // Un texte trop long est coupé sans casser un emoji.
    const long = cleanMarginText("😀".repeat(MAX_MARGIN_TEXT + 10));
    expect(Array.from(long)).toHaveLength(MAX_MARGIN_TEXT);
    expect(long.endsWith("😀")).toBe(true);
  });

  it("critère 1 : chacun a son alignement (gauche, centre, droite), à gauche par défaut", () => {
    for (const align of ["left", "center", "right"] as const) {
      expect(headerFooterFromAttrs({ pageHeader: { text: "a", align } }).header.align).toBe(align);
    }
    expect(headerFooterFromAttrs({ pageHeader: { text: "a", align: "justify" } }).header).toEqual({
      text: "a",
      align: "left",
    });
  });

  it("critère 2 : en haut et en bas de chaque page, à côté du numéro de page sans le chevaucher", () => {
    const rules = printMarginRules({
      ...DEFAULT_HEADER_FOOTER,
      pageNumbers: { position: "center", skipFirst: false },
      header: { text: "Léa Martin", align: "right" },
      footer: { text: "Collège Jean Moulin", align: "left" },
    });
    expect(rules).toContain('@top-right { content: "Léa Martin";');
    expect(rules).toContain('@bottom-left { content: "Collège Jean Moulin";');
    expect(rules).toContain("@bottom-center { content: counter(page);");
    expect(rules).toContain("color: #5f5f5c");
    // Même position que le numéro : une seule zone, le texte puis le numéro.
    const shared = printMarginRules({
      ...DEFAULT_HEADER_FOOTER,
      pageNumbers: { position: "right", skipFirst: false },
      footer: { text: "Exposé", align: "right" },
    });
    expect(shared).toContain('@bottom-right { content: "Exposé" " – " counter(page);');
  });

  it("critère 2 : un texte avec des guillemets ou des balises reste une chaîne CSS", () => {
    const rules = printMarginRules({
      ...DEFAULT_HEADER_FOOTER,
      header: { text: 'a"; } body { display: none } </style><b>\\', align: "left" },
    });
    expect(rules).toContain(
      'content: "a\\22 ; } body { display: none } \\3c /style\\3e \\3c b\\3e \\5c ";',
    );
    expect(rules).not.toContain("</style>");
  });

  it("critère 4 : « Pas d'en-tête ni de pied de page sur la première page », pour une page de garde", () => {
    const first = marginBoxes(FULL, true);
    expect(first.top).toEqual({});
    // Le numéro de la première page est aussi retiré ici (case de T2.15) : rien en bas.
    expect(first.bottom).toEqual({});
    const others = marginBoxes(FULL, false);
    expect(others.top).toEqual({ right: [{ kind: "text", text: "Léa Martin — 3e B 😀" }] });
    expect(others.bottom).toEqual({
      left: [{ kind: "text", text: "Exposé : les volcans" }],
      right: [{ kind: "page" }],
    });
    // Numéro gardé sur la page 1, en-tête et pied de page retirés.
    const keepNumber = marginBoxes(
      { ...FULL, pageNumbers: { position: "right", skipFirst: false } },
      true,
    );
    expect(keepNumber).toEqual({ top: {}, bottom: { right: [{ kind: "page" }] } });
    const [, firstRules] = printMarginRules(FULL).split("@page :first");
    expect(firstRules).toContain("@top-right { content: none;");
    expect(firstRules).toContain("@bottom-left { content: none;");
  });

  it("critère 5 : enregistrés dans le document, avec la mise en page, et relus à la réouverture", () => {
    const ydoc = ydocFromJson(SAMPLE_DOCUMENT);
    writeHeaderFooter(ydoc, FULL);
    const file = JSON.parse(serializeDocument({ id: "doc-1", ydoc })) as {
      version: number;
      content: { attrs: Record<string, unknown> };
      ydoc: string;
    };
    expect(file.version).toBe(NANO_FORMAT_VERSION);
    expect(file.content.attrs).toEqual({
      pageNumbers: { position: "right", skipFirst: true },
      pageHeader: { text: "Léa Martin — 3e B 😀", align: "right" },
      pageFooter: { text: "Exposé : les volcans", align: "left" },
      headerFooterSkipFirst: true,
    });
    expect(readHeaderFooter(reopen(ydoc))).toEqual(FULL);
    // Depuis content seul, quand ydoc est abîmé.
    const result = parseDocument(JSON.stringify({ ...file, ydoc: "AAAA" }));
    if (!result.ok) throw new Error(result.error);
    expect(readHeaderFooter(result.ydoc)).toEqual(FULL);
    // Dans la copie de secours (état Yjs complet).
    const backup = new Y.Doc();
    Y.applyUpdate(backup, Y.encodeStateAsUpdate(ydoc));
    expect(readHeaderFooter(backup)).toEqual(FULL);
  });

  it("critère 5 : une valeur écrite à la main invalide vaut la valeur par défaut, sans bloquer l'ouverture", () => {
    expect(
      headerFooterFromAttrs({
        pageNumbers: "oui",
        pageHeader: { text: 3, align: 1 },
        pageFooter: null,
        headerFooterSkipFirst: "true",
      }),
    ).toEqual(DEFAULT_HEADER_FOOTER);
  });

  it("critère 5 : un en-tête vide n'écrit rien ; revenir aux réglages par défaut efface les attributs", () => {
    const ydoc = ydocFromJson(SAMPLE_DOCUMENT);
    writeHeaderFooter(ydoc, { ...DEFAULT_HEADER_FOOTER, header: { text: "   ", align: "right" } });
    expect(ydoc.getMap("page").size).toBe(0);
    writeHeaderFooter(ydoc, FULL);
    writeHeaderFooter(ydoc, DEFAULT_HEADER_FOOTER);
    expect(ydoc.getMap("page").size).toBe(0);
    expect(readPageSetup(ydoc)).toEqual(DEFAULT_PAGE_SETUP);
  });

  it("critère 5 : un changement est d'origine « mise en page », annulable avec elle, et compte comme modification", () => {
    const ydoc = ydocFromJson(SAMPLE_DOCUMENT);
    const origins: unknown[] = [];
    ydoc.on("afterTransaction", (transaction: Y.Transaction) => origins.push(transaction.origin));
    writeHeaderFooter(ydoc, FULL);
    expect(origins).toEqual([PAGE_SETUP_ORIGIN]);
    writeHeaderFooter(ydoc, FULL);
    expect(origins).toHaveLength(1);
    const empty = new Y.Doc();
    writeHeaderFooter(empty, NUMBERED);
    expect(hasUnsavedChanges({ id: "d", ydoc: empty, fileName: null, savedSnapshot: null })).toBe(
      true,
    );
  });

  it("critère 5 : dans l'export Word, les en-têtes et pieds de page de Word, sans la première page", async () => {
    const { headers, footers, document } = await wordXml(FULL);
    expect(document).toContain("w:titlePg");
    expect(headers.some((xml) => xml.includes("Léa Martin — 3e B 😀"))).toBe(true);
    expect(
      footers.some((xml) => xml.includes("Exposé : les volcans") && xml.includes("PAGE")),
    ).toBe(true);
    // La première page a son en-tête et son pied de page, vides.
    expect(headers.some((xml) => !xml.includes("Léa Martin"))).toBe(true);
    expect(footers.some((xml) => !xml.includes("PAGE") && !xml.includes("Exposé"))).toBe(true);
  });
});
