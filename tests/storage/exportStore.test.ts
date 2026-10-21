// Écriture d'un fichier exporté (T2.7) : sélecteur de Chrome et Edge, téléchargement ailleurs, annulation
// et échec, avec un faux navigateur. Le fichier courant de FileStore n'est jamais concerné.
import { describe, expect, it } from "vitest";
import { exportFile, type ExportEnvironment, type ExportFile } from "../../src/storage/exportStore";

const FILE: ExportFile = {
  suggestedName: "Lettre à Zoé 😀.docx",
  data: new Uint8Array([1, 2, 3]),
  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  extension: ".docx",
  description: "Document Word",
};

/** Faux sélecteur : garde les appels et ce qui est écrit. */
function fakePicker(
  options: { cancel?: boolean; failWrite?: boolean; failPicker?: boolean; chosen?: string } = {},
) {
  const calls: string[] = [];
  const written: Uint8Array[] = [];
  const environment: ExportEnvironment = {
    showSaveFilePicker: async (pickerOptions) => {
      const acceptAll = pickerOptions.excludeAcceptAllOption !== true;
      calls.push(
        `picker:${pickerOptions.suggestedName}:${JSON.stringify(pickerOptions.types)}:acceptAll=${String(acceptAll)}`,
      );
      if (options.cancel) throw new DOMException("Annulé", "AbortError");
      if (options.failPicker) throw new Error("refusé");
      return {
        name: options.chosen ?? "choisi.docx",
        createWritable: async () => {
          calls.push("createWritable");
          return {
            write: async (data: Blob) => {
              calls.push("write");
              if (options.failWrite) throw new Error("disque plein");
              written.push(new Uint8Array(await data.arrayBuffer()));
            },
            close: async () => {
              calls.push("close");
            },
            abort: async () => {
              calls.push("abort");
            },
          };
        },
      };
    },
  };
  return { environment, calls, written };
}

describe("T2.7 : écrire le fichier Word", () => {
  it("critère 1 : Chrome et Edge proposent un sélecteur, puis le fichier est écrit d'un coup", async () => {
    const { environment, calls, written } = fakePicker();
    expect(await exportFile(FILE, environment)).toEqual({ status: "saved", name: "choisi.docx" });
    expect(calls[0]).toContain("picker:Lettre à Zoé 😀.docx");
    expect(calls[0]).toContain(".docx");
    // Pas de choix « Tous les fichiers » : un .nano ne peut pas être choisi dans la liste.
    expect(calls[0]).toContain("acceptAll=false");
    expect(calls.slice(1)).toEqual(["createWritable", "write", "close"]);
    expect(written).toEqual([new Uint8Array([1, 2, 3])]);
  });

  it("critère 1 : sans sélecteur (Safari, Firefox), le fichier est téléchargé", async () => {
    const downloads: { name: string; size: number; type: string }[] = [];
    const environment: ExportEnvironment = {
      download: (name, blob) => downloads.push({ name, size: blob.size, type: blob.type }),
    };
    expect(await exportFile(FILE, environment)).toEqual({
      status: "downloaded",
      name: "Lettre à Zoé 😀.docx",
    });
    expect(downloads).toEqual([{ name: "Lettre à Zoé 😀.docx", size: 3, type: FILE.mime }]);
  });

  it("critère 1 : le fichier .nano n'est jamais modifié : un fichier choisi qui n'est pas un .docx est refusé sans rien écrire", async () => {
    // Le sélecteur ne propose que les fichiers Word ; « lettre.nano » ne peut venir que d'un nom tapé.
    for (const chosen of ["lettre.nano", "lettre", "notes.docx.nano", "lettre.DOCX.txt"]) {
      const { environment, calls, written } = fakePicker({ chosen });
      expect(await exportFile(FILE, environment)).toEqual({ status: "wrongType", name: chosen });
      expect(calls).not.toContain("createWritable");
      expect(written).toEqual([]);
    }
    const upperCase = fakePicker({ chosen: "LETTRE.DOCX" });
    expect(await exportFile(FILE, upperCase.environment)).toEqual({
      status: "saved",
      name: "LETTRE.DOCX",
    });
  });

  it("fermer le sélecteur annule sans rien écrire", async () => {
    const { environment, calls } = fakePicker({ cancel: true });
    expect(await exportFile(FILE, environment)).toEqual({ status: "cancelled" });
    expect(calls).toHaveLength(1);
  });

  it("une écriture impossible renvoie un échec, et l'écriture commencée est abandonnée", async () => {
    const failing = fakePicker({ failWrite: true });
    expect(await exportFile(FILE, failing.environment)).toEqual({ status: "failed" });
    expect(failing.calls.slice(1)).toEqual(["createWritable", "write", "abort"]);
    const refused = fakePicker({ failPicker: true });
    expect(await exportFile(FILE, refused.environment)).toEqual({ status: "failed" });
    const brokenDownload: ExportEnvironment = {
      download: () => {
        throw new Error("bloqué");
      },
    };
    expect(await exportFile(FILE, brokenDownload)).toEqual({ status: "failed" });
  });
});
