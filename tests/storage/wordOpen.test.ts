// « Ouvrir… » d'un fichier Word (T2.18, critère 1) dans les deux implémentations de FileStore : le fichier est lu
// en octets et ne devient jamais le fichier courant, même accepté, pour que « Enregistrer » n'y écrive jamais.
import { describe, expect, it } from "vitest";
import { DownloadStore } from "../../src/storage/downloadStore";
import { FileSystemAccessStore } from "../../src/storage/fileSystemAccessStore";
import { type CallLog, FakeHandle, fakePickers } from "./fakeHandles";

describe("T2.18 critère 1 : un fichier Word n'est jamais le fichier courant", () => {
  it("critère 1 : Chrome et Edge lisent le .docx en octets, et « Enregistrer » demande ensuite un emplacement", async () => {
    const log: CallLog = [];
    const fake = fakePickers(log);
    const store = new FileSystemAccessStore(fake.pickers);
    const word = new FakeHandle("Lettre.docx", "PK contenu Word", log);
    fake.state.nextOpen = word;
    const opened = await store.open(() => true);
    expect(opened?.name).toBe("Lettre.docx");
    expect(opened?.text).toBe("");
    expect(new TextDecoder().decode(opened?.bytes)).toBe("PK contenu Word");
    fake.state.nextSave = new FakeHandle("Lettre.nano", "", log);
    log.length = 0;
    await store.save("document");
    expect(log[0]).toBe("showSaveFilePicker");
    expect(word.content).toBe("PK contenu Word");
  });

  it("critère 1 : un document .nano ouvert reste lu en texte et devient le fichier courant", async () => {
    const log: CallLog = [];
    const fake = fakePickers(log);
    const store = new FileSystemAccessStore(fake.pickers);
    fake.state.nextOpen = new FakeHandle("Lettre.nano", "{}", log);
    expect(await store.open(() => true)).toEqual({ name: "Lettre.nano", text: "{}" });
    log.length = 0;
    await store.save("v2");
    expect(log).not.toContain("showSaveFilePicker");
  });

  it("critère 1 : Safari et Firefox lisent le .docx en octets, et « Enregistrer » ne reprend pas son nom", async () => {
    const downloads: string[] = [];
    let next: File | null = new File(["PK"], "Lettre.docx");
    const store = new DownloadStore({
      download: (name) => downloads.push(name),
      pickFile: async () => next,
    });
    const opened = await store.open(() => true);
    expect(opened?.bytes?.length).toBe(2);
    next = null;
    await store.save("document");
    expect(downloads).toEqual(["document.nano"]);
  });
});
