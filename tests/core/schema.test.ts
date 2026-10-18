// Tests du schéma partagé (src/core/schema.ts) : gras, italique, identifiants de bloc, sans éditeur.
import { describe, expect, it } from "vitest";
import { Editor, getSchema } from "@tiptap/core";
import {
  BlockId,
  documentExtensions,
  documentSchema,
  YJS_FRAGMENT_NAME,
} from "../../src/core/schema";
import { jsonFromYdoc, paragraph, SAMPLE_DOCUMENT, ydocFromJson } from "./helpers";

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

  it("critère 6 de T0b : Entrée en fin de paragraphe ne copie pas son identifiant (keepOnSplit)", () => {
    // Éditeur sans affichage : seul le schéma partagé, sans le générateur d'identifiants de T0b.
    // Tiptap n'applique keepOnSplit qu'en fin de bloc ; au milieu, c'est le générateur qui corrige.
    const editor = new Editor({
      element: null,
      extensions: documentExtensions,
      content: { type: "doc", content: [paragraph("p-1", { text: "abcd" })] },
    });
    editor.commands.setTextSelection(5);
    editor.commands.splitBlock();
    const ids = editor.getJSON().content?.map((node) => node.attrs?.id);
    expect(ids).toEqual(["p-1", null]);
    editor.destroy();
  });
});
