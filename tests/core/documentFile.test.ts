// Tests de la logique d'ouverture et d'enregistrement d'un document (src/core/documentFile.ts), ticket T0c.
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  CORRUPTED_FILE_MESSAGE,
  contentSnapshot,
  DEFAULT_FILE_NAME,
  createNewDocument,
  hasUnsavedChanges,
  markSaved,
  openDocumentText,
  windowTitle,
} from "../../src/core/documentFile";
import { serializeDocument } from "../../src/core/fileFormat";
import { YJS_FRAGMENT_NAME } from "../../src/core/schema";
import { jsonFromYdoc, paragraph, SAMPLE_DOCUMENT, ydocFromJson } from "./helpers";

/** Texte d'un fichier `.nano` valide contenant `SAMPLE_DOCUMENT`. */
function sampleFileText(id = "doc-1"): string {
  return serializeDocument({ id, ydoc: ydocFromJson(SAMPLE_DOCUMENT) });
}

/** Ajoute un paragraphe de texte à la fin du document, comme le ferait une saisie. */
function typeParagraph(ydoc: Y.Doc, text: string) {
  const element = new Y.XmlElement("paragraph");
  element.insert(0, [new Y.XmlText(text)]);
  const fragment = ydoc.getXmlFragment(YJS_FRAGMENT_NAME);
  fragment.insert(fragment.length, [element]);
}

describe("createNewDocument", () => {
  it("critère 1 : « Nouveau » crée un document vide avec un nouvel id", () => {
    const first = createNewDocument();
    const second = createNewDocument();
    expect(first.id).not.toBe(second.id);
    expect(first.ydoc).not.toBe(second.ydoc);
    expect(jsonFromYdoc(first.ydoc).content ?? []).toEqual([]);
  });

  it("critère 2 : un nouveau document n'a pas de nom de fichier", () => {
    expect(createNewDocument().fileName).toBeNull();
  });

  it("critère 3 : le nom proposé par défaut est document.nano", () => {
    expect(DEFAULT_FILE_NAME).toBe("document.nano");
  });
});

describe("openDocumentText", () => {
  it("critère 9 : ouvrir un fichier crée un nouveau Y.Doc avec son contenu, sans toucher au document en cours", () => {
    const current = createNewDocument();
    typeParagraph(current.ydoc, "Document en cours");
    const before = jsonFromYdoc(current.ydoc);

    const result = openDocumentText("lettre.nano", sampleFileText());
    if (!result.ok) throw new Error(result.message);
    expect(result.document.ydoc).not.toBe(current.ydoc);
    expect(result.document.id).toBe("doc-1");
    expect(result.document.fileName).toBe("lettre.nano");
    expect(jsonFromYdoc(result.document.ydoc)).toEqual(jsonFromYdoc(ydocFromJson(SAMPLE_DOCUMENT)));
    expect(jsonFromYdoc(current.ydoc)).toEqual(before);
  });

  it("critère 9 : ouvrir deux fois le même fichier donne deux Y.Doc distincts, sans mélange", () => {
    const first = openDocumentText("a.nano", sampleFileText());
    const second = openDocumentText("a.nano", sampleFileText());
    if (!first.ok || !second.ok) throw new Error("ouverture échouée");
    expect(first.document.ydoc).not.toBe(second.document.ydoc);
    expect(jsonFromYdoc(second.document.ydoc).content).toHaveLength(2);
  });

  it("critère 11 : enregistrer puis rouvrir redonne exactement le même contenu (texte, gras, italique, paragraphes, accents, emojis)", () => {
    const original = ydocFromJson(SAMPLE_DOCUMENT);
    const result = openDocumentText("x.nano", serializeDocument({ id: "doc-1", ydoc: original }));
    if (!result.ok) throw new Error(result.message);
    expect(jsonFromYdoc(result.document.ydoc)).toEqual(jsonFromYdoc(original));
  });

  it("critère 11 : un document vide et un texte très long font l'aller-retour", () => {
    const long = "àé😀 ".repeat(25_000);
    for (const json of [
      { type: "doc", content: [] },
      { type: "doc", content: [paragraph("p", { text: long })] },
    ]) {
      const original = ydocFromJson(json);
      const result = openDocumentText("x.nano", serializeDocument({ id: "doc-1", ydoc: original }));
      if (!result.ok) throw new Error(result.message);
      expect(jsonFromYdoc(result.document.ydoc)).toEqual(jsonFromYdoc(original));
    }
  });

  it("critère 11 : un document ouvert n'a pas de modifications non enregistrées", () => {
    const result = openDocumentText("x.nano", sampleFileText());
    if (!result.ok) throw new Error(result.message);
    expect(hasUnsavedChanges(result.document)).toBe(false);
  });

  it("critère 12 : un JSON invalide affiche un message clair en français", () => {
    const result = openDocumentText("x.nano", "{ pas du JSON");
    expect(result).toEqual({ ok: false, message: "Ce fichier n'est pas un document Nano Office." });
  });

  it("critère 12 : un fichier qui n'est pas un .nano affiche un message clair en français", () => {
    for (const text of ["", "Bonjour", JSON.stringify({ format: "autre", version: 1 }), "[]"]) {
      expect(openDocumentText("x.txt", text)).toEqual({
        ok: false,
        message: "Ce fichier n'est pas un document Nano Office.",
      });
    }
  });

  it("critère 12 : un fichier d'une version inconnue affiche un message clair en français", () => {
    const file = JSON.parse(sampleFileText()) as Record<string, unknown>;
    const result = openDocumentText("x.nano", JSON.stringify({ ...file, version: 2 }));
    expect(result).toEqual({
      ok: false,
      message:
        "Ce document vient d'une version de Nano Office que cette application ne sait pas lire. Mettez Nano Office à jour pour l'ouvrir.",
    });
  });

  it("critère 15 : un fichier abîmé affiche « Ce fichier est abîmé et ne peut pas être ouvert. Il n'a pas été modifié. »", () => {
    const file = JSON.parse(sampleFileText()) as Record<string, unknown>;
    const empty = JSON.parse(serializeDocument({ id: "doc-1", ydoc: new Y.Doc() })) as Record<
      string,
      unknown
    >;
    const result = openDocumentText(
      "x.nano",
      JSON.stringify({ ...file, content: "abîmé", ydoc: empty.ydoc }),
    );
    expect(CORRUPTED_FILE_MESSAGE).toBe(
      "Ce fichier est abîmé et ne peut pas être ouvert. Il n'a pas été modifié.",
    );
    expect(result).toEqual({ ok: false, message: CORRUPTED_FILE_MESSAGE });
  });
});

describe("openDocumentText : fichier abîmé dont l'état Yjs contient du texte", () => {
  it("critères 14 et 15 : un content abîmé avec un ydoc plein de texte est refusé avec le message rassurant", () => {
    const file = JSON.parse(sampleFileText()) as Record<string, unknown>;
    for (const content of [undefined, "abîmé", { type: "inconnu" }]) {
      expect(openDocumentText("x.nano", JSON.stringify({ ...file, content }))).toEqual({
        ok: false,
        message: CORRUPTED_FILE_MESSAGE,
      });
    }
  });
});

describe("hasUnsavedChanges et markSaved", () => {
  it("critère 1 : un nouveau document sans texte n'a pas de modifications à enregistrer", () => {
    const doc = createNewDocument();
    expect(hasUnsavedChanges(doc)).toBe(false);
    // L'éditeur ajoute un paragraphe vide à l'ouverture : ce n'est pas une modification de l'utilisateur.
    typeParagraph(doc.ydoc, "");
    expect(hasUnsavedChanges(doc)).toBe(false);
  });

  it("critère 1 : un nouveau document avec du texte a des modifications non enregistrées", () => {
    const doc = createNewDocument();
    typeParagraph(doc.ydoc, "é");
    expect(hasUnsavedChanges(doc)).toBe(true);
  });

  it("critère 13 : après enregistrement, plus de modification ; une nouvelle saisie en crée une", () => {
    const doc = createNewDocument();
    typeParagraph(doc.ydoc, "Bonjour");
    const saved = markSaved(doc, "lettre.nano");
    expect(saved.fileName).toBe("lettre.nano");
    expect(saved.ydoc).toBe(doc.ydoc);
    expect(saved.id).toBe(doc.id);
    expect(hasUnsavedChanges(saved)).toBe(false);
    typeParagraph(doc.ydoc, "Suite");
    expect(hasUnsavedChanges(saved)).toBe(true);
  });

  it("critère 13 : un document ouvert puis modifié a des modifications non enregistrées", () => {
    const result = openDocumentText("x.nano", sampleFileText());
    if (!result.ok) throw new Error(result.message);
    typeParagraph(result.document.ydoc, "ajout");
    expect(hasUnsavedChanges(result.document)).toBe(true);
  });

  it("markSaved accepte un instantané pris avant l'écriture, pour ne pas oublier une saisie faite pendant l'enregistrement", () => {
    const doc = createNewDocument();
    typeParagraph(doc.ydoc, "Avant");
    const snapshot = contentSnapshot(doc.ydoc);
    typeParagraph(doc.ydoc, "Pendant l'écriture");
    const saved = markSaved(doc, "a.nano", snapshot);
    expect(hasUnsavedChanges(saved)).toBe(true);
  });
});

describe("windowTitle", () => {
  it("critère 13 : le titre indique le nom du fichier", () => {
    expect(windowTitle("lettre.nano", false)).toBe("lettre.nano - Nano Office");
  });

  it("critère 13 : le titre porte un repère • s'il y a des modifications non enregistrées", () => {
    expect(windowTitle("lettre.nano", true)).toBe("• lettre.nano - Nano Office");
  });

  it("critère 13 : un document jamais enregistré s'appelle « Sans titre »", () => {
    expect(windowTitle(null, false)).toBe("Sans titre - Nano Office");
    expect(windowTitle(null, true)).toBe("• Sans titre - Nano Office");
  });
});
