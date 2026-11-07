// Fichier et copie de secours faits avec @tiptap/y-tiptap 3.0.10 (P1, critère 7) : la version suivante du pont
// entre Tiptap et Yjs les relit à l'identique. Les fichiers de référence sont dans tests/fixtures/yTiptap/.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { backupFromUpdates } from "../../src/core/backup";
import { contentOf, parseDocument, serializeDocument } from "../../src/core/fileFormat";
import type { DocumentJson } from "../../src/core/types";

const FIXTURES = new URL("../fixtures/yTiptap/", import.meta.url);

/** Fichier `.nano` enregistré par l'application avec y-tiptap 3.0.10. */
const REFERENCE = readFileSync(new URL("reference-3.0.10.nano", FIXTURES), "utf8");

/** Copie de secours du même document, modifié ensuite sans enregistrer : mises à jour Yjs, en base64. */
const BACKUP = JSON.parse(readFileSync(new URL("backup-3.0.10.json", FIXTURES), "utf8")) as {
  id: string;
  updates: string[];
  content: DocumentJson;
};

function bytes(base64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

describe("P1 : fichier et copie de secours faits avec y-tiptap 3.0.10", () => {
  it("critère 7 : le fichier de référence se rouvre à l'identique, et se réenregistre avec le même état Yjs", () => {
    const parsed = parseDocument(REFERENCE);
    if (!parsed.ok) throw new Error(parsed.error);
    const file = JSON.parse(REFERENCE) as { id: string; content: DocumentJson; ydoc: string };
    expect(parsed.id).toBe(file.id);
    expect(contentOf(parsed.ydoc)).toEqual(file.content);
    // Réenregistré : même contenu et même historique Yjs (mêmes modifications de chaque auteur). Les octets de
    // `ydoc` peuvent différer, car Yjs regroupe les morceaux effacés en réencodant, quelle que soit la version.
    const saved = JSON.parse(
      serializeDocument({ id: parsed.id, ydoc: parsed.ydoc }),
    ) as typeof file;
    expect(saved.content).toEqual(file.content);
    expect(saved.id).toBe(file.id);
    expect(Y.encodeStateVectorFromUpdate(bytes(saved.ydoc))).toEqual(
      Y.encodeStateVectorFromUpdate(bytes(file.ydoc)),
    );
  });

  it("critère 7 : la copie de secours de référence se relit à l'identique, avec ses accents et ses emojis", () => {
    const backup = backupFromUpdates(BACKUP.updates.map(bytes));
    if (!backup) throw new Error("copie de secours illisible");
    expect(contentOf(backup)).toEqual(BACKUP.content);
    expect(JSON.stringify(BACKUP.content)).toContain("élève 😀");
  });
});
