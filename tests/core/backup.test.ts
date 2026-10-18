// Tests de la comparaison d'un fichier avec sa copie de secours (src/core/backup.ts), ticket T0d.
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  backupFromUpdates,
  compareWithBackup,
  recoveredDocument,
  restoredDocument,
} from "../../src/core/backup";
import { hasUnsavedChanges, openDocumentText } from "../../src/core/documentFile";
import { serializeDocument } from "../../src/core/fileFormat";
import type { OpenDocument } from "../../src/core/types";
import { jsonFromYdoc, paragraph, SAMPLE_DOCUMENT, ydocFromJson } from "./helpers";

/** Document ouvert depuis un fichier `.nano` contenant `SAMPLE_DOCUMENT`. */
function openSample(id = "doc-1"): OpenDocument {
  const result = openDocumentText(
    "lettre.nano",
    serializeDocument({ id, ydoc: ydocFromJson(SAMPLE_DOCUMENT) }),
  );
  if (!result.ok) throw new Error(result.message);
  return result.document;
}

/** Copie de secours relue telle que l'enregistre y-indexeddb : une liste de mises à jour Yjs. */
function backupOf(ydoc: Y.Doc): Y.Doc {
  const backup = backupFromUpdates([Y.encodeStateAsUpdate(ydoc)]);
  if (!backup) throw new Error("copie de secours vide");
  return backup;
}

const CHANGED_DOCUMENT = {
  type: "doc",
  content: [paragraph("p-1", { text: "Texte modifié, non enregistré 😀" })],
};

describe("backupFromUpdates", () => {
  it("critère 6 : la copie de secours est lue dans un nouveau Y.Doc, jamais dans le document ouvert", () => {
    const file = openSample();
    const backup = backupOf(ydocFromJson(CHANGED_DOCUMENT));
    expect(backup).not.toBe(file.ydoc);
    expect(jsonFromYdoc(file.ydoc)).toEqual(SAMPLE_DOCUMENT);
    expect(jsonFromYdoc(backup)).toEqual(CHANGED_DOCUMENT);
  });

  it("applique toutes les mises à jour dans l'ordre", () => {
    const ydoc = new Y.Doc();
    const updates: Uint8Array[] = [];
    ydoc.on("update", (update: Uint8Array) => updates.push(update));
    ydoc.getXmlFragment("default").insert(0, [new Y.XmlText("a")]);
    ydoc.getXmlFragment("default").insert(1, [new Y.XmlText("b")]);
    const backup = backupFromUpdates(updates);
    expect(backup?.getXmlFragment("default").toString()).toBe("ab");
  });

  it("renvoie null quand il n'y a pas de copie de secours (aucune mise à jour, ou des mises à jour vides)", () => {
    expect(backupFromUpdates([])).toBeNull();
    expect(backupFromUpdates([Y.encodeStateAsUpdate(new Y.Doc())])).toBeNull();
  });

  it("renvoie null pour une copie de secours illisible, sans exception", () => {
    expect(backupFromUpdates([new Uint8Array([255, 1, 2, 3])])).toBeNull();
  });
});

describe("compareWithBackup", () => {
  it("critère 7 : une copie de secours au même contenu que le fichier est « same »", () => {
    const file = openSample();
    // Même contenu, mais un historique Yjs différent : seul le contenu compte.
    expect(compareWithBackup(file, backupOf(ydocFromJson(SAMPLE_DOCUMENT)))).toBe("same");
  });

  it("critère 8 : une copie de secours au contenu différent est « different »", () => {
    expect(compareWithBackup(openSample(), backupOf(ydocFromJson(CHANGED_DOCUMENT)))).toBe(
      "different",
    );
  });

  it("critère 8 : une copie de secours vidée de son texte diffère du fichier", () => {
    const emptied = backupOf(ydocFromJson({ type: "doc", content: [paragraph("p-1")] }));
    expect(compareWithBackup(openSample(), emptied)).toBe("different");
  });

  it("sans copie de secours, le résultat est « none »", () => {
    expect(compareWithBackup(openSample(), null)).toBe("none");
  });
});

describe("recoveredDocument", () => {
  it("critère 9 : « Récupérer » garde la copie seule, sans la fusionner avec le fichier", () => {
    const file = openSample();
    const backup = backupOf(ydocFromJson(CHANGED_DOCUMENT));
    const recovered = recoveredDocument(file, backup);
    expect(recovered.ydoc).toBe(backup);
    expect(jsonFromYdoc(recovered.ydoc)).toEqual(CHANGED_DOCUMENT);
    expect(recovered.id).toBe(file.id);
    expect(recovered.fileName).toBe("lettre.nano");
  });

  it("critère 9 : le document récupéré est marqué comme non enregistré", () => {
    const file = openSample();
    const recovered = recoveredDocument(file, backupOf(ydocFromJson(CHANGED_DOCUMENT)));
    expect(hasUnsavedChanges(recovered)).toBe(true);
  });
});

describe("restoredDocument", () => {
  it("critère 4 : restaure le dernier document modifié sous son id, comme document non enregistré", () => {
    const backup = backupOf(ydocFromJson(CHANGED_DOCUMENT));
    const restored = restoredDocument("doc-7", backup);
    expect(restored?.id).toBe("doc-7");
    expect(restored?.ydoc).toBe(backup);
    expect(restored?.fileName).toBeNull();
    expect(restored && hasUnsavedChanges(restored)).toBe(true);
  });

  it("ne restaure pas une copie de secours sans texte (document vide)", () => {
    const blank = backupOf(ydocFromJson({ type: "doc", content: [paragraph("p-1")] }));
    expect(restoredDocument("doc-7", blank)).toBeNull();
    expect(restoredDocument("doc-7", null)).toBeNull();
  });

  it("restaure un texte très long avec accents et emojis", () => {
    const text = "Élève à l'école 👨‍👩‍👧 ".repeat(5000);
    const backup = backupOf(ydocFromJson({ type: "doc", content: [paragraph("p-1", { text })] }));
    const restored = restoredDocument("doc-7", backup);
    expect(restored && jsonFromYdoc(restored.ydoc).content?.[0]?.content?.[0]?.text).toBe(text);
  });
});
