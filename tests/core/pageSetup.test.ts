// Mise en page (T2.5) : préréglages, valeurs par défaut, attributs du nœud `doc`, aller-retour du format
// `.nano` sans changement de version, copie de secours et modifications non enregistrées.
import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { contentSnapshot, hasUnsavedChanges, markSaved } from "../../src/core/documentFile";
import { contentOf, parseDocument, serializeDocument } from "../../src/core/fileFormat";
import {
  DEFAULT_PAGE_SETUP,
  formatCm,
  parseCm,
  MARGIN_PRESETS,
  marginChoice,
  PAGE_SETUP_ORIGIN,
  pageSetupFromAttrs,
  pageSize,
  readMargin,
  readPageSetup,
  uniformMargins,
  writePageSetup,
  type PageSetup,
} from "../../src/core/pageSetup";
import { NANO_FORMAT_VERSION, type OpenDocument } from "../../src/core/types";
import { jsonFromYdoc, SAMPLE_DOCUMENT, ydocFromJson } from "./helpers";

const LANDSCAPE_CUSTOM: PageSetup = {
  orientation: "landscape",
  margins: { top: 1, bottom: 4.9, left: 0.5, right: 5 },
};

function reopen(ydoc: Y.Doc) {
  const result = parseDocument(serializeDocument({ id: "doc-1", ydoc }));
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe("T2.5 : mise en page", () => {
  it("critère 1 : marges Normales (2,5 cm), Étroites (1,27 cm), Larges (3,5 cm), toujours en A4", () => {
    expect(MARGIN_PRESETS.map(({ label, cm }) => [label, cm])).toEqual([
      ["Normales", 2.5],
      ["Étroites", 1.27],
      ["Larges", 3.5],
    ]);
    expect(pageSize("portrait")).toEqual({ width: 21, height: 29.7 });
    expect(pageSize("landscape")).toEqual({ width: 29.7, height: 21 });
  });

  it("critère 1 : une marge personnalisée va de 0,5 à 5 cm", () => {
    expect(readMargin(0.5)).toBe(0.5);
    expect(readMargin(5)).toBe(5);
    expect(readMargin(1.27)).toBe(1.27);
    for (const value of [
      0.4,
      5.1,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "2",
      null,
      undefined,
    ]) {
      expect(readMargin(value)).toBeNull();
    }
  });

  it("critère 1 : des marges égales à un préréglage sont reconnues, les autres sont personnalisées", () => {
    expect(marginChoice(uniformMargins(2.5))).toBe("normal");
    expect(marginChoice(uniformMargins(1.27))).toBe("narrow");
    expect(marginChoice(uniformMargins(3.5))).toBe("wide");
    expect(marginChoice({ ...uniformMargins(2.5), left: 3 })).toBe("custom");
  });

  it("critère 4 : un document sans réglage est en portrait, avec les marges Normales", () => {
    expect(readPageSetup(ydocFromJson(SAMPLE_DOCUMENT))).toEqual(DEFAULT_PAGE_SETUP);
    expect(DEFAULT_PAGE_SETUP).toEqual({ orientation: "portrait", margins: uniformMargins(2.5) });
  });

  it("critère 4 et 6 : un fichier sans ces attributs reste valide et s'ouvre en portrait, marges Normales", () => {
    const ydoc = ydocFromJson(SAMPLE_DOCUMENT);
    const result = reopen(ydoc);
    expect(readPageSetup(result.ydoc)).toEqual(DEFAULT_PAGE_SETUP);
    expect(contentOf(result.ydoc)).toEqual(jsonFromYdoc(ydoc));
    expect(contentOf(result.ydoc).attrs).toBeUndefined();
  });

  it("critère 3 et 6 : les réglages sont des attributs du nœud doc de content, et dans ydoc, sans changer la version", () => {
    const ydoc = ydocFromJson(SAMPLE_DOCUMENT);
    writePageSetup(ydoc, LANDSCAPE_CUSTOM);
    const file = JSON.parse(serializeDocument({ id: "doc-1", ydoc })) as Record<string, unknown>;
    expect(file.version).toBe(NANO_FORMAT_VERSION);
    expect(NANO_FORMAT_VERSION).toBe(2);
    expect(file.content).toEqual({
      ...jsonFromYdoc(ydoc),
      attrs: {
        pageOrientation: "landscape",
        pageMargins: { top: 1, bottom: 4.9, left: 0.5, right: 5 },
      },
    });
    // Dans ydoc : un Y.Doc relu depuis ce seul champ retrouve la mise en page.
    const fromYdoc = new Y.Doc();
    Y.applyUpdate(fromYdoc, Buffer.from(file.ydoc as string, "base64"));
    expect(readPageSetup(fromYdoc)).toEqual(LANDSCAPE_CUSTOM);
  });

  it("critère 3 : retrouvés à la réouverture du fichier, sur l'autre ordinateur", () => {
    const ydoc = ydocFromJson(SAMPLE_DOCUMENT);
    writePageSetup(ydoc, LANDSCAPE_CUSTOM);
    const result = reopen(ydoc);
    expect(readPageSetup(result.ydoc)).toEqual(LANDSCAPE_CUSTOM);
    expect(jsonFromYdoc(result.ydoc)).toEqual(jsonFromYdoc(ydoc));
  });

  it("critère 3 : retrouvés depuis content quand ydoc est abîmé", () => {
    const ydoc = ydocFromJson(SAMPLE_DOCUMENT);
    writePageSetup(ydoc, LANDSCAPE_CUSTOM);
    const file = JSON.parse(serializeDocument({ id: "doc-1", ydoc })) as Record<string, unknown>;
    const result = parseDocument(JSON.stringify({ ...file, ydoc: "AAAA" }));
    if (!result.ok) throw new Error(result.error);
    expect(readPageSetup(result.ydoc)).toEqual(LANDSCAPE_CUSTOM);
  });

  it("critère 3 : content l'emporte quand la mise en page de ydoc diffère", () => {
    const ydoc = ydocFromJson(SAMPLE_DOCUMENT);
    writePageSetup(ydoc, LANDSCAPE_CUSTOM);
    const file = JSON.parse(serializeDocument({ id: "doc-1", ydoc })) as {
      content: Record<string, unknown>;
    };
    const edited = {
      ...file,
      content: { ...file.content, attrs: { pageOrientation: "landscape" } },
    };
    const result = parseDocument(JSON.stringify(edited));
    if (!result.ok) throw new Error(result.error);
    expect(readPageSetup(result.ydoc)).toEqual({
      orientation: "landscape",
      margins: uniformMargins(2.5),
    });
  });

  it("critère 3 : gardés dans la copie de secours (état Yjs complet)", () => {
    const ydoc = ydocFromJson(SAMPLE_DOCUMENT);
    writePageSetup(ydoc, LANDSCAPE_CUSTOM);
    const backup = new Y.Doc();
    Y.applyUpdate(backup, Y.encodeStateAsUpdate(ydoc));
    expect(readPageSetup(backup)).toEqual(LANDSCAPE_CUSTOM);
  });

  it("critère 6 : une valeur invalide écrite à la main vaut la valeur par défaut, sans bloquer l'ouverture", () => {
    expect(
      pageSetupFromAttrs({
        pageOrientation: "diagonal",
        pageMargins: { top: "2", bottom: 99, left: 0.1, right: 1.5 },
      }),
    ).toEqual({
      orientation: "portrait",
      margins: { top: 2.5, bottom: 2.5, left: 2.5, right: 1.5 },
    });
    for (const attrs of [null, 3, "x", [], { pageMargins: [1, 2] }]) {
      expect(pageSetupFromAttrs(attrs)).toEqual(DEFAULT_PAGE_SETUP);
    }
    const ydoc = ydocFromJson(SAMPLE_DOCUMENT);
    const file = JSON.parse(serializeDocument({ id: "doc-1", ydoc })) as {
      content: Record<string, unknown>;
    };
    const edited = {
      ...file,
      content: { ...file.content, attrs: { pageOrientation: 12, pageMargins: "large" } },
    };
    const result = parseDocument(JSON.stringify(edited));
    expect(result.ok).toBe(true);
    if (result.ok) expect(readPageSetup(result.ydoc)).toEqual(DEFAULT_PAGE_SETUP);
  });

  it("critère 5 : un changement est une seule transaction, d'origine suivie par l'annulation", () => {
    const ydoc = ydocFromJson(SAMPLE_DOCUMENT);
    const origins: unknown[] = [];
    ydoc.on("afterTransaction", (transaction: Y.Transaction) => origins.push(transaction.origin));
    writePageSetup(ydoc, LANDSCAPE_CUSTOM);
    expect(origins).toEqual([PAGE_SETUP_ORIGIN]);
    // Une mise en page inchangée n'écrit rien.
    writePageSetup(ydoc, LANDSCAPE_CUSTOM);
    expect(origins).toHaveLength(1);
  });

  it("critère 5 : annulé en une fois par un UndoManager qui suit la mise en page", () => {
    const ydoc = ydocFromJson(SAMPLE_DOCUMENT);
    const undo = new Y.UndoManager(ydoc.getMap("page"), {
      trackedOrigins: new Set([PAGE_SETUP_ORIGIN]),
    });
    writePageSetup(ydoc, LANDSCAPE_CUSTOM);
    undo.undo();
    expect(readPageSetup(ydoc)).toEqual(DEFAULT_PAGE_SETUP);
  });

  it("critère 5 : changer la mise en page compte comme une modification", () => {
    const ydoc = ydocFromJson(SAMPLE_DOCUMENT);
    const saved: OpenDocument = markSaved(
      { id: "doc-1", ydoc, fileName: null, savedSnapshot: null },
      "a.nano",
    );
    expect(hasUnsavedChanges(saved)).toBe(false);
    writePageSetup(ydoc, { ...DEFAULT_PAGE_SETUP, orientation: "landscape" });
    expect(hasUnsavedChanges(saved)).toBe(true);
    // Revenir aux réglages par défaut redonne le contenu enregistré.
    writePageSetup(ydoc, DEFAULT_PAGE_SETUP);
    expect(hasUnsavedChanges(saved)).toBe(false);
    expect(contentSnapshot(ydoc)).toBe(saved.savedSnapshot);
  });

  it("critère 5 : sur une page blanche jamais enregistrée, une mise en page réglée compte aussi", () => {
    const ydoc = new Y.Doc();
    const blank: OpenDocument = { id: "doc-2", ydoc, fileName: null, savedSnapshot: null };
    expect(hasUnsavedChanges(blank)).toBe(false);
    writePageSetup(ydoc, { ...DEFAULT_PAGE_SETUP, margins: uniformMargins(1.27) });
    expect(hasUnsavedChanges(blank)).toBe(true);
  });

  it("un document vide, très long, avec accents et emojis garde sa mise en page", () => {
    const long = {
      type: "doc",
      content: Array.from({ length: 2000 }, (_, index) => ({
        type: "paragraph",
        attrs: { id: `p-${index}` },
        content: [{ type: "text", text: `Ligne ${index} : été, Noël 🎄` }],
      })),
    };
    for (const json of [{ type: "doc", content: [] }, long]) {
      const ydoc = ydocFromJson(json);
      writePageSetup(ydoc, LANDSCAPE_CUSTOM);
      expect(readPageSetup(reopen(ydoc).ydoc)).toEqual(LANDSCAPE_CUSTOM);
    }
  });
});

describe("T2.5 : marges tapées à la française", () => {
  it("critère 1 : « 2,5 » et « 2.5 » se lisent, une valeur hors bornes ou illisible est refusée", () => {
    expect(parseCm("2,5")).toBe(2.5);
    expect(parseCm(" 2.5 ")).toBe(2.5);
    expect(parseCm("1,27")).toBe(1.27);
    expect(parseCm("5")).toBe(5);
    for (const text of ["", "abc", "0,4", "5,1", "-1", "1,2,3", "2 cm"]) {
      expect(parseCm(text)).toBeNull();
    }
  });

  it("une marge s'affiche avec une virgule", () => {
    expect(formatCm(1.27)).toBe("1,27");
    expect(formatCm(3)).toBe("3");
  });
});
