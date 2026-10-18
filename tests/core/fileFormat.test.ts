// Tests du format de fichier `.nano` version 1 (src/core/fileFormat.ts), critères 2 à 5 et 7 à 11 de T0a.
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createDocumentId, parseDocument, serializeDocument } from "../../src/core/fileFormat";
import { bytesToBase64 } from "../../src/core/base64";
import { YJS_FRAGMENT_NAME } from "../../src/core/schema";
import type { DocumentJson, ParseResult } from "../../src/core/types";
import { FIRST_PARAGRAPH, jsonFromYdoc, paragraph, SAMPLE_DOCUMENT, ydocFromJson } from "./helpers";

/** Sérialise puis relit un document, et vérifie que la lecture a réussi. */
function roundTrip(json: DocumentJson, id = createDocumentId()) {
  const result = parseDocument(serializeDocument({ id, ydoc: ydocFromJson(json) }));
  if (!result.ok) throw new Error(`Lecture échouée : ${result.error}`);
  return result;
}

/** Fichier `.nano` valide, sous forme d'objet modifiable par les tests. */
function validFile(json: DocumentJson = SAMPLE_DOCUMENT): Record<string, unknown> {
  return JSON.parse(serializeDocument({ id: "doc-1", ydoc: ydocFromJson(json) })) as Record<
    string,
    unknown
  >;
}

function expectError(result: ParseResult, error: string) {
  expect(result).toEqual({ ok: false, error });
}

describe("serializeDocument", () => {
  it("critère 2 : un document sérialisé contient format, version (1), id, content et ydoc", () => {
    const file = validFile();
    expect(file.format).toBe("nano-office");
    expect(file.version).toBe(1);
    expect(file.id).toBe("doc-1");
    expect(file.content).toEqual(expect.objectContaining({ type: "doc" }));
    expect(typeof file.ydoc).toBe("string");
  });

  it("critère 5 : le content enregistré est calculé à partir du ydoc enregistré", () => {
    const ydoc = ydocFromJson(SAMPLE_DOCUMENT);
    const file = JSON.parse(serializeDocument({ id: "doc-1", ydoc })) as { content: unknown };
    expect(file.content).toEqual(jsonFromYdoc(ydoc));
  });

  it("critère 5 : le content suit les modifications du ydoc, sans être fourni par l'appelant", () => {
    const ydoc = ydocFromJson(SAMPLE_DOCUMENT);
    ydoc.getXmlFragment(YJS_FRAGMENT_NAME).delete(1, 1);
    const file = JSON.parse(serializeDocument({ id: "doc-1", ydoc })) as {
      content: DocumentJson;
    };
    expect(file.content.content).toHaveLength(1);
    expect(file.content).toEqual(jsonFromYdoc(ydoc));
  });

  it("produit un JSON lisible, sans modifier le Y.Doc", () => {
    const ydoc = ydocFromJson(SAMPLE_DOCUMENT);
    const before = Y.encodeStateVector(ydoc);
    serializeDocument({ id: "doc-1", ydoc });
    expect(Y.encodeStateVector(ydoc)).toEqual(before);
  });
});

describe("parseDocument : aller-retour", () => {
  it("critère 3 : sérialiser puis relire redonne le même id et le même contenu (texte, gras, italique, paragraphes, accents, emojis)", () => {
    const id = createDocumentId();
    const result = roundTrip(SAMPLE_DOCUMENT, id);
    expect(result.id).toBe(id);
    expect(result.version).toBe(1);
    expect(jsonFromYdoc(result.ydoc)).toEqual(jsonFromYdoc(ydocFromJson(SAMPLE_DOCUMENT)));
  });

  it("critère 4 : les identifiants de paragraphes sont conservés après l'aller-retour", () => {
    const result = roundTrip(SAMPLE_DOCUMENT);
    const ids = jsonFromYdoc(result.ydoc).content?.map((block) => block.attrs?.id);
    expect(ids).toEqual(["p-1", "p-2"]);
  });

  it("relit un document vide", () => {
    const empty = new Y.Doc();
    const result = parseDocument(serializeDocument({ id: "vide", ydoc: empty }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(jsonFromYdoc(result.ydoc)).toEqual({ type: "doc", content: [] });
  });

  it("relit un paragraphe vide", () => {
    const json: DocumentJson = {
      type: "doc",
      content: [{ type: "paragraph", attrs: { id: "p" } }],
    };
    expect(jsonFromYdoc(roundTrip(json).ydoc)).toEqual(json);
  });

  it("relit un texte très long", () => {
    const longText = "Il était une fois une très longue histoire. ".repeat(5_000);
    const json: DocumentJson = { type: "doc", content: [paragraph("long", { text: longText })] };
    const text = jsonFromYdoc(roundTrip(json).ydoc).content?.[0]?.content?.[0]?.text;
    expect(text).toBe(longText);
  });

  it("relit les accents et les emojis composés sans les abîmer", () => {
    const text = "àâäéèêëîïôöùûüÿçœæ ÀÉÈÇŒ « guillemets » 👩🏽‍💻 👨‍👩‍👧‍👦 🇫🇷 ❤️";
    const json: DocumentJson = { type: "doc", content: [paragraph("p", { text })] };
    expect(jsonFromYdoc(roundTrip(json).ydoc).content?.[0]?.content?.[0]?.text).toBe(text);
  });

  it("crée toujours un nouveau Y.Doc, distinct de celui qui a été enregistré", () => {
    const ydoc = ydocFromJson(SAMPLE_DOCUMENT);
    const result = parseDocument(serializeDocument({ id: "doc-1", ydoc }));
    expect(result.ok && result.ydoc).not.toBe(ydoc);
  });
});

describe("parseDocument : ydoc abîmé, repli sur content", () => {
  const expected = jsonFromYdoc(ydocFromJson(SAMPLE_DOCUMENT));

  function parseWithYdoc(ydoc: unknown) {
    return parseDocument(JSON.stringify({ ...validFile(), ydoc }));
  }

  function expectRebuiltFromContent(result: ParseResult) {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.id).toBe("doc-1");
    expect(jsonFromYdoc(result.ydoc)).toEqual(expected);
  }

  it("critère 7 : si ydoc est illisible (pas du base64), le document est reconstruit à partir de content", () => {
    expectRebuiltFromContent(parseWithYdoc("!!! pas du base64 !!!"));
  });

  it("critère 7 : si ydoc est illisible (octets aléatoires), le document est reconstruit à partir de content", () => {
    const garbage = new Uint8Array(64).map((_, i) => (i * 37 + 11) % 256);
    expectRebuiltFromContent(parseWithYdoc(bytesToBase64(garbage)));
  });

  it("critère 7 : si ydoc est absent ou n'est pas une chaîne, le document est reconstruit à partir de content", () => {
    expectRebuiltFromContent(parseWithYdoc(undefined));
    expectRebuiltFromContent(parseWithYdoc(42));
  });

  it("critère 8 : si ydoc est lisible mais vide, le document est reconstruit à partir de content", () => {
    expectRebuiltFromContent(parseWithYdoc(bytesToBase64(Y.encodeStateAsUpdate(new Y.Doc()))));
  });

  it("critère 8 : si ydoc est lisible mais partiel, le document est reconstruit à partir de content", () => {
    const partial = ydocFromJson({ type: "doc", content: [FIRST_PARAGRAPH] });
    expectRebuiltFromContent(parseWithYdoc(bytesToBase64(Y.encodeStateAsUpdate(partial))));
  });

  it("critère 8 : si ydoc est tronqué, le document est reconstruit à partir de content", () => {
    const full = Y.encodeStateAsUpdate(ydocFromJson(SAMPLE_DOCUMENT));
    expectRebuiltFromContent(parseWithYdoc(bytesToBase64(full.subarray(0, full.length / 2))));
  });

  it("renvoie corrupted si ydoc et content sont tous deux inutilisables, sans exception", () => {
    const file = { ...validFile(), ydoc: "!!!", content: { type: "inconnu" } };
    expectError(parseDocument(JSON.stringify(file)), "corrupted");
    expectError(parseDocument(JSON.stringify({ ...file, content: undefined })), "corrupted");
  });

  it("renvoie corrupted si content ne respecte pas le schéma et que ydoc est illisible", () => {
    const nested = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "paragraph" }] }],
    };
    expectError(
      parseDocument(JSON.stringify({ ...validFile(), ydoc: "!!!", content: nested })),
      "corrupted",
    );
  });

  it("garde le ydoc lisible si content est absent : ydoc est la source de vérité", () => {
    const result = parseDocument(JSON.stringify({ ...validFile(), content: undefined }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(jsonFromYdoc(result.ydoc)).toEqual(expected);
  });
});

describe("parseDocument : fichiers refusés", () => {
  it("critère 9 : un JSON invalide renvoie invalid-json, sans exception", () => {
    expectError(parseDocument("{ pas du json"), "invalid-json");
    expectError(parseDocument(""), "invalid-json");
  });

  it("critère 9 : un fichier qui n'est pas un .nano renvoie not-nano, sans exception", () => {
    for (const text of ["null", "42", '"texte"', "[]", "{}", '{"format":"autre","version":1}']) {
      expectError(parseDocument(text), "not-nano");
    }
    expectError(parseDocument(JSON.stringify({ ...validFile(), format: "autre" })), "not-nano");
    expectError(parseDocument(JSON.stringify({ ...validFile(), version: "1" })), "not-nano");
    expectError(parseDocument(JSON.stringify({ ...validFile(), version: 1.5 })), "not-nano");
  });

  it("critère 9 : une version inconnue renvoie unsupported-version, sans exception", () => {
    expectError(
      parseDocument(JSON.stringify({ ...validFile(), version: 2 })),
      "unsupported-version",
    );
    expectError(
      parseDocument(JSON.stringify({ ...validFile(), version: 0 })),
      "unsupported-version",
    );
  });

  it("critère 10 : un fichier sans id ou avec un id vide est refusé avec l'erreur not-nano", () => {
    expectError(parseDocument(JSON.stringify({ ...validFile(), id: undefined })), "not-nano");
    expectError(parseDocument(JSON.stringify({ ...validFile(), id: "" })), "not-nano");
    expectError(parseDocument(JSON.stringify({ ...validFile(), id: "   " })), "not-nano");
    expectError(parseDocument(JSON.stringify({ ...validFile(), id: 12 })), "not-nano");
  });
});

describe("createDocumentId", () => {
  it("critère 11 : deux appels à createDocumentId ne renvoient jamais la même valeur", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => createDocumentId()));
    expect(ids.size).toBe(10_000);
  });

  it("renvoie un UUID", () => {
    expect(createDocumentId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
