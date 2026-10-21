// Tests du format `.nano` version 2 (src/core/fileFormat.ts, src/core/migrations.ts), ticket T1.9 :
// images rangées une seule fois, références seules dans content et ydoc, migration depuis la version 1,
// image manquante, version inconnue.
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { base64ToBytes } from "../../src/core/base64";
import { imageHash, readImage, storeImage } from "../../src/core/images";
import { migrateToCurrent, migrateV1ToV2 } from "../../src/core/migrations";
import { parseDocument, serializeDocument } from "../../src/core/fileFormat";
import type { DocumentJson, NanoFileV2 } from "../../src/core/types";
import { jsonFromYdoc, paragraph, SAMPLE_DOCUMENT, ydocFromJson } from "./helpers";
import {
  countNodes,
  fakePng,
  illustratedDocument,
  imageNode,
  versionOneFile,
  ydocWithImages,
} from "./imageHelpers";

/** Sérialise un Y.Doc et relit le fichier écrit en JSON. */
function saved(ydoc: Y.Doc, id = "doc-1"): NanoFileV2 {
  return JSON.parse(serializeDocument({ id, ydoc })) as NanoFileV2;
}

/** Lit un fichier et vérifie que la lecture a réussi. */
function parsed(text: string) {
  const result = parseDocument(text);
  if (!result.ok) throw new Error(`Lecture échouée : ${result.error}`);
  return result;
}

/** Vrai si `needle` apparaît, octet pour octet, dans `haystack`. */
function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let start = 0; start + needle.length <= haystack.length; start++) {
    for (let i = 0; i < needle.length; i++) if (haystack[start + i] !== needle[i]) continue outer;
    return true;
  }
  return false;
}

describe("format .nano version 2 : images", () => {
  it("critère 6 : chaque image est rangée une seule fois, sous son empreinte SHA-256", () => {
    const photo = fakePng(1, 4096);
    const { ydoc, hashes } = ydocWithImages((h) => illustratedDocument(h[0] ?? ""), [photo]);
    const file = saved(ydoc);
    expect(file.version).toBe(2);
    expect(hashes[0]).toBe(imageHash(photo.data));
    expect(Object.keys(file.images)).toEqual(hashes);
    expect(file.images[hashes[0] ?? ""]).toEqual({
      type: "image/png",
      data: expect.any(String) as string,
    });
    expect(base64ToBytes(file.images[hashes[0] ?? ""]?.data ?? "")).toEqual(photo.data);
  });

  it("critère 6 : content et ydoc ne contiennent qu'une référence à l'empreinte", () => {
    const photo = fakePng(1, 4096);
    const { ydoc, hashes } = ydocWithImages((h) => illustratedDocument(h[0] ?? ""), [photo]);
    const file = saved(ydoc);
    expect(JSON.stringify(file.content)).toContain(`"hash":"${hashes[0] ?? ""}"`);
    expect(JSON.stringify(file.content)).not.toContain(file.images[hashes[0] ?? ""]?.data);
    const ydocBytes = base64ToBytes(file.ydoc);
    expect(containsBytes(ydocBytes, photo.data.subarray(0, 256))).toBe(false);
    expect(ydocBytes.length).toBeLessThan(photo.data.length);
  });

  it("critère 6 : une image insérée deux fois n'est rangée qu'une fois", () => {
    const photo = fakePng(1);
    const { ydoc, hashes } = ydocWithImages(
      ([hash = ""]) => ({
        type: "doc",
        content: [imageNode("i-1", hash, "Une"), imageNode("i-2", hash, "Deux")],
      }),
      [photo, photo],
    );
    const file = saved(ydoc);
    expect(hashes[0]).toBe(hashes[1]);
    expect(Object.keys(file.images)).toHaveLength(1);
    expect(countNodes(parsed(JSON.stringify(file)).ydoc, "image")).toBe(2);
  });

  it("critère 6 : une image retirée du document n'est plus enregistrée", () => {
    const kept = fakePng(1);
    const removed = fakePng(2);
    const { ydoc, hashes } = ydocWithImages(
      ([first = ""]) => illustratedDocument(first),
      [kept, removed],
    );
    // L'image retirée reste dans le Y.Doc (pour Ctrl/Cmd+Z et la copie de secours), pas dans le fichier.
    expect(readImage(ydoc, hashes[1] ?? "")).not.toBeNull();
    expect(Object.keys(saved(ydoc).images)).toEqual([hashes[0]]);
  });

  it("critère 6 : l'enregistrement ne modifie pas le Y.Doc, qui garde ses images", () => {
    const { ydoc, hashes } = ydocWithImages((h) => illustratedDocument(h[0] ?? ""), [fakePng(1)]);
    const before = Y.encodeStateVector(ydoc);
    saved(ydoc);
    saved(ydoc);
    expect(Y.encodeStateVector(ydoc)).toEqual(before);
    expect(readImage(ydoc, hashes[0] ?? "")?.data).toEqual(fakePng(1).data);
  });

  it("critère 3 et 6 : aller-retour, l'image garde son identifiant, son texte et sa largeur", () => {
    const photo = fakePng(3, 2048);
    const { ydoc, hashes } = ydocWithImages(
      ([hash = ""]) => ({
        type: "doc",
        content: [
          paragraph("p-1", { text: "Légende" }),
          {
            type: "image",
            attrs: { id: "img-1", hash, alt: "Logo", width: 320, textAlign: "center" },
          },
        ],
      }),
      [photo],
    );
    const result = parsed(serializeDocument({ id: "doc-1", ydoc }));
    expect(jsonFromYdoc(result.ydoc)).toEqual(jsonFromYdoc(ydoc));
    expect(readImage(result.ydoc, hashes[0] ?? "")).toEqual({
      type: "image/png",
      data: photo.data,
    });
  });

  it("critère 6 : deux enregistrements et réouvertures successifs gardent l'image, une seule fois", () => {
    const { ydoc, hashes } = ydocWithImages((h) => illustratedDocument(h[0] ?? ""), [fakePng(4)]);
    const first = parsed(serializeDocument({ id: "doc-1", ydoc }));
    const second = parsed(serializeDocument({ id: "doc-1", ydoc: first.ydoc }));
    const file = saved(second.ydoc);
    expect(Object.keys(file.images)).toEqual(hashes);
    expect(jsonFromYdoc(second.ydoc)).toEqual(jsonFromYdoc(ydoc));
  });

  it("critère 5 : accents et emojis dans le texte de remplacement", () => {
    const alt = "Mémé à l'île d'Oléron 👵🏽🌊 « été »";
    const { ydoc } = ydocWithImages((h) => illustratedDocument(h[0] ?? "", alt), [fakePng(1)]);
    const result = parsed(serializeDocument({ id: "doc-1", ydoc }));
    expect(jsonFromYdoc(result.ydoc).content?.[1]?.attrs?.alt).toBe(alt);
  });

  it("critère 6 : si ydoc diffère de content, le document vient de content et garde ses images", () => {
    const { ydoc, hashes } = ydocWithImages((h) => illustratedDocument(h[0] ?? ""), [fakePng(1)]);
    const file = saved(ydoc);
    const result = parsed(JSON.stringify({ ...file, ydoc: "illisible" }));
    expect(jsonFromYdoc(result.ydoc)).toEqual(file.content);
    expect(readImage(result.ydoc, hashes[0] ?? "")).not.toBeNull();
  });
});

describe("format .nano version 2 : image manquante", () => {
  it("critère 9 : une référence sans contenu s'ouvre, l'image est manquante, le reste du document est intact", () => {
    const { ydoc, hashes } = ydocWithImages((h) => illustratedDocument(h[0] ?? ""), [fakePng(1)]);
    const file = saved(ydoc);
    const result = parsed(JSON.stringify({ ...file, images: {} }));
    expect(jsonFromYdoc(result.ydoc)).toEqual(file.content);
    expect(readImage(result.ydoc, hashes[0] ?? "")).toBeNull();
  });

  it("critère 9 : une entrée d'image abîmée (format inconnu, base64 illisible, pas un objet) est manquante, sans plantage", () => {
    const { ydoc, hashes } = ydocWithImages((h) => illustratedDocument(h[0] ?? ""), [fakePng(1)]);
    const file = saved(ydoc);
    const hash = hashes[0] ?? "";
    for (const entry of [
      { type: "image/bmp", data: file.images[hash]?.data },
      { type: "image/png", data: "%%% pas du base64 %%%" },
      { type: "image/png", data: 42 },
      "texte",
      null,
    ]) {
      const result = parsed(JSON.stringify({ ...file, images: { [hash]: entry } }));
      expect(readImage(result.ydoc, hash)).toBeNull();
      expect(jsonFromYdoc(result.ydoc)).toEqual(file.content);
    }
  });

  it("critère 9 : un champ images absent ou qui n'est pas un objet ne bloque pas l'ouverture", () => {
    const { ydoc } = ydocWithImages((h) => illustratedDocument(h[0] ?? ""), [fakePng(1)]);
    const file = saved(ydoc) as unknown as Record<string, unknown>;
    for (const images of [undefined, null, [], "texte"]) {
      const result = parsed(JSON.stringify({ ...file, images }));
      expect(jsonFromYdoc(result.ydoc)).toEqual(file.content);
    }
  });

  it("critère 9 : une image sans empreinte valide s'ouvre aussi, sans plantage", () => {
    const json: DocumentJson = {
      type: "doc",
      content: [imageNode("i-1", "pas-une-empreinte"), paragraph("p-1", { text: "Suite" })],
    };
    const result = parsed(serializeDocument({ id: "doc-1", ydoc: ydocFromJson(json) }));
    expect(jsonFromYdoc(result.ydoc).content?.[1]).toEqual(paragraph("p-1", { text: "Suite" }));
  });

  it("une image venue d'un fichier n'est rangée que si le document l'utilise", () => {
    const { ydoc, hashes } = ydocWithImages((h) => illustratedDocument(h[0] ?? ""), [fakePng(1)]);
    const file = saved(ydoc);
    const extra = storeImage(new Y.Doc(), fakePng(9));
    const images = { ...file.images, [extra]: file.images[hashes[0] ?? ""] };
    const result = parsed(JSON.stringify({ ...file, images }));
    expect(readImage(result.ydoc, extra)).toBeNull();
  });
});

describe("migration de la version 1 à la version 2", () => {
  const headings: DocumentJson = {
    type: "doc",
    content: [
      { type: "heading", attrs: { id: "h-1", level: 1 }, content: [{ type: "text", text: "Été" }] },
      paragraph("p-1", { text: "Œuvre 😀" }),
    ],
  };
  const lists: DocumentJson = {
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            attrs: { id: "li-1" },
            content: [paragraph("p-1", { text: "Pain" })],
          },
        ],
      },
    ],
  };
  const tables: DocumentJson = {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                attrs: { id: "c-1" },
                content: [paragraph("p-1", { text: "Poste" })],
              },
              {
                type: "tableCell",
                attrs: { id: "c-2" },
                content: [paragraph("p-2", { text: "350 €" })],
              },
            ],
          },
        ],
      },
      paragraph("p-3", { text: "Fin" }),
    ],
  };

  it("critère 7 : un fichier version 1 s'ouvre tel quel : document vide, titres, listes et tableaux", () => {
    for (const json of [{ type: "doc" }, SAMPLE_DOCUMENT, headings, lists, tables]) {
      const result = parsed(versionOneFile(json));
      expect(result.id).toBe("doc-v1");
      expect(jsonFromYdoc(result.ydoc)).toEqual(jsonFromYdoc(ydocFromJson(json)));
    }
  });

  it("critère 7 : un fichier version 1 rouvert est enregistré en version 2, avec le même id et le même contenu", () => {
    for (const json of [{ type: "doc" }, headings, lists, tables]) {
      const reopened = parsed(versionOneFile(json));
      const file = saved(reopened.ydoc, reopened.id);
      expect(file.version).toBe(2);
      expect(file.id).toBe("doc-v1");
      expect(file.images).toEqual({});
      expect(jsonFromYdoc(parsed(JSON.stringify(file)).ydoc)).toEqual(
        jsonFromYdoc(ydocFromJson(json)),
      );
    }
  });

  it("critère 7 : un fichier version 1 d'avant le renommage, écrit par l'application, s'ouvre encore", () => {
    const text = String.raw`{"format":"nano-office","version":1,"id":"3f2b8c1e-5d4a-4e6b-9a7c-1d2e3f4a5b6c","content":{"type":"doc","content":[{"type":"paragraph","attrs":{"id":"p-1"},"content":[{"type":"text","text":"Lettre écrite avant le renommage 😀"}]}]},"ydoc":"AQT5yJfYDgAHAQdkZWZhdWx0AwlwYXJhZ3JhcGgHAPnIl9gOAAYEAPnIl9gOASZMZXR0cmUgw6ljcml0ZSBhdmFudCBsZSByZW5vbW1hZ2Ug8J+YgCgA+ciX2A4AAmlkAXcDcC0xAA=="}`;
    const result = parsed(text);
    expect(jsonFromYdoc(result.ydoc)).toEqual({
      type: "doc",
      content: [paragraph("p-1", { text: "Lettre écrite avant le renommage 😀" })],
    });
  });

  it("critère 7 : un fichier version 1 garde ses règles : content abîmé refusé, ydoc abîmé remplacé par content", () => {
    const file = JSON.parse(versionOneFile(SAMPLE_DOCUMENT)) as Record<string, unknown>;
    expect(parseDocument(JSON.stringify({ ...file, content: { type: "rien" } }))).toEqual({
      ok: false,
      error: "corrupted",
    });
    const repaired = parsed(JSON.stringify({ ...file, ydoc: "AAAA" }));
    expect(jsonFromYdoc(repaired.ydoc)).toEqual(jsonFromYdoc(ydocFromJson(SAMPLE_DOCUMENT)));
  });

  it("critère 7 : migrateV1ToV2 ajoute une liste d'images vide, sans toucher au reste", () => {
    const v1 = {
      format: "nano-office",
      version: 1,
      id: "x",
      content: { type: "doc" },
      ydoc: "AA==",
    };
    expect(migrateV1ToV2(v1)).toEqual({ ...v1, version: 2, images: {} });
    expect(v1.version).toBe(1);
  });

  it("critère 7 : migrateToCurrent laisse un fichier version 2 tel quel et refuse une version inconnue", () => {
    const v2 = { version: 2, images: {} };
    expect(migrateToCurrent(v2, 2)).toBe(v2);
    expect(migrateToCurrent({ version: 3 }, 2)).toBeNull();
    expect(migrateToCurrent({ version: 0 }, 2)).toBeNull();
  });
});

describe("version inconnue", () => {
  it("critère 7 : un fichier d'une version plus récente que celle de l'application est refusé proprement", () => {
    const { ydoc } = ydocWithImages((h) => illustratedDocument(h[0] ?? ""), [fakePng(1)]);
    const file = saved(ydoc);
    expect(parseDocument(JSON.stringify({ ...file, version: 3 }))).toEqual({
      ok: false,
      error: "unsupported-version",
    });
  });

  it("critère 7 : un fichier version 2 porte « version: 2 », que la version 1 de l'application refuse (elle n'acceptait que 1)", () => {
    const file = saved(ydocFromJson(SAMPLE_DOCUMENT));
    // Règle de la version 1 (src/core/fileFormat.ts avant T1.9) : `data.version !== 1` → « version inconnue ».
    const readByVersionOne = (data: { version: unknown }) =>
      data.version === 1 ? "ok" : "unsupported-version";
    expect(readByVersionOne(file)).toBe("unsupported-version");
  });
});
