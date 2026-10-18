// Tests du schéma partagé (src/core/schema.ts) : gras, italique, identifiants de bloc, sans éditeur.
import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import {
  BlockId,
  documentExtensions,
  documentSchema,
  YJS_FRAGMENT_NAME,
} from "../../src/core/schema";
import { jsonFromYdoc, SAMPLE_DOCUMENT, ydocFromJson } from "./helpers";

describe("schéma partagé", () => {
  it("contient paragraphes, texte, gras et italique", () => {
    expect(Object.keys(documentSchema.nodes)).toEqual(
      expect.arrayContaining(["doc", "paragraph", "text"]),
    );
    expect(Object.keys(documentSchema.marks)).toEqual(expect.arrayContaining(["bold", "italic"]));
  });

  it("ajoute l'attribut d'identifiant aux paragraphes, vide par défaut", () => {
    expect(documentSchema.nodes.paragraph?.spec.attrs).toHaveProperty("id");
    const node = documentSchema.nodeFromJSON({ type: "paragraph" });
    expect(node.attrs.id).toBeNull();
  });

  it("documentSchema est obtenu à partir de documentExtensions, qui contient BlockId", () => {
    expect(documentExtensions).toContain(BlockId);
    const rebuilt = getSchema(documentExtensions);
    expect(Object.keys(rebuilt.nodes)).toEqual(Object.keys(documentSchema.nodes));
    expect(Object.keys(rebuilt.marks)).toEqual(Object.keys(documentSchema.marks));
  });

  it("a un nom de fragment Yjs non vide", () => {
    expect(YJS_FRAGMENT_NAME).not.toBe("");
  });

  it("critère 6 : un document construit avec documentSchema (gras, italique, identifiants) est relu sans éditeur", () => {
    const node = documentSchema.nodeFromJSON(SAMPLE_DOCUMENT);
    node.check();
    const ydoc = ydocFromJson(SAMPLE_DOCUMENT);
    const reread = documentSchema.nodeFromJSON(jsonFromYdoc(ydoc));
    expect(reread.eq(node)).toBe(true);
    expect(reread.firstChild?.attrs.id).toBe("p-1");
  });
});
