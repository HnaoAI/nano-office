// Tests des images dans la copie de secours et les modifications non enregistrées (T1.9, critère 8) :
// src/core/backup.ts et src/core/documentFile.ts.
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  backupFromUpdates,
  compareWithBackup,
  recoveredDocument,
  restoredDocument,
} from "../../src/core/backup";
import { hasUnsavedChanges, openDocumentText } from "../../src/core/documentFile";
import { storeImage } from "../../src/core/images";
import { serializeDocument } from "../../src/core/fileFormat";
import { readImage } from "../../src/core/images";
import type { NanoFileV2, OpenDocument } from "../../src/core/types";
import { jsonFromYdoc } from "./helpers";
import { fakePng, illustratedDocument, imageNode, ydocWithImages } from "./imageHelpers";

/** Copie de secours relue telle que l'enregistre y-indexeddb. */
function backupOf(ydoc: Y.Doc): Y.Doc {
  const backup = backupFromUpdates([Y.encodeStateAsUpdate(ydoc)]);
  if (!backup) throw new Error("copie de secours vide");
  return backup;
}

/** Ouvre le texte d'un fichier `.nano`. */
function open(text: string): OpenDocument {
  const result = openDocumentText("photos.nano", text);
  if (!result.ok) throw new Error(result.message);
  return result.document;
}

describe("images et copie de secours", () => {
  it("critère 8 : la copie de secours contient les images, relues avec le document", () => {
    const { ydoc, hashes } = ydocWithImages((h) => illustratedDocument(h[0] ?? ""), [fakePng(1)]);
    const backup = backupOf(ydoc);
    expect(readImage(backup, hashes[0] ?? "")?.data).toEqual(fakePng(1).data);
    expect(jsonFromYdoc(backup)).toEqual(jsonFromYdoc(ydoc));
  });

  it("critère 8 : une page qui n'a qu'une image est restaurée au rechargement, avec son image", () => {
    const { ydoc, hashes } = ydocWithImages(
      ([hash = ""]) => ({ type: "doc", content: [imageNode("i-1", hash)] }),
      [fakePng(1)],
    );
    const restored = restoredDocument("doc-1", backupOf(ydoc));
    expect(restored).not.toBeNull();
    expect(readImage(restored?.ydoc ?? new Y.Doc(), hashes[0] ?? "")).not.toBeNull();
  });

  it("critère 8 : une page qui n'a qu'une image compte comme modification non enregistrée", () => {
    const { ydoc } = ydocWithImages(
      ([hash = ""]) => ({ type: "doc", content: [imageNode("i-1", hash)] }),
      [fakePng(1)],
    );
    expect(hasUnsavedChanges({ id: "d", ydoc, fileName: null, savedSnapshot: null })).toBe(true);
  });

  it("critère 8 : « Récupérer » garde les images de la copie de secours", () => {
    const { ydoc: saved } = ydocWithImages((h) => illustratedDocument(h[0] ?? ""), [fakePng(1)]);
    const file = open(serializeDocument({ id: "doc-1", ydoc: saved }));
    const { ydoc: edited, hashes } = ydocWithImages(
      (h) => illustratedDocument(h[0] ?? "", "Nouvelle photo"),
      [fakePng(2)],
    );
    const backup = backupOf(edited);
    expect(compareWithBackup(file, backup)).toBe("different");
    const recovered = recoveredDocument(file, backup);
    expect(readImage(recovered.ydoc, hashes[0] ?? "")?.data).toEqual(fakePng(2).data);
  });

  it("critère 8 : un fichier et sa copie identiques, images comprises, sont « same »", () => {
    const { ydoc } = ydocWithImages((h) => illustratedDocument(h[0] ?? ""), [fakePng(1)]);
    const file = open(serializeDocument({ id: "doc-1", ydoc }));
    expect(compareWithBackup(file, backupOf(ydoc))).toBe("same");
  });

  it("critère 8 : une image manquante dans le fichier mais présente dans la copie rend la copie différente, pour ne pas la perdre", () => {
    const { ydoc } = ydocWithImages((h) => illustratedDocument(h[0] ?? ""), [fakePng(1)]);
    const text = serializeDocument({ id: "doc-1", ydoc });
    const withoutImages = JSON.stringify({ ...(JSON.parse(text) as NanoFileV2), images: {} });
    const file = open(withoutImages);
    expect(compareWithBackup(file, backupOf(ydoc))).toBe("different");
  });

  it("critère 8 : une image retirée de la page reste dans la copie de secours (Ctrl/Cmd+Z la remet après un rechargement)", () => {
    const { ydoc, hashes } = ydocWithImages((h) => illustratedDocument(h[0] ?? ""), [fakePng(1)]);
    const fragment = ydoc.getXmlFragment("default");
    fragment.delete(1, 1);
    expect(readImage(backupOf(ydoc), hashes[0] ?? "")).not.toBeNull();
  });

  it("critère 9 : remettre une image manquante compte comme une modification à enregistrer", () => {
    const { ydoc } = ydocWithImages((h) => illustratedDocument(h[0] ?? ""), [fakePng(1)]);
    const text = serializeDocument({ id: "doc-1", ydoc });
    const file = open(JSON.stringify({ ...(JSON.parse(text) as NanoFileV2), images: {} }));
    expect(hasUnsavedChanges(file)).toBe(false);
    storeImage(file.ydoc, fakePng(1));
    expect(hasUnsavedChanges(file)).toBe(true);
  });
});
