// Tests du souvenir du fichier d'un document entre deux lancements (PL3), avec FileSystemAccessStore,
// de fausses poignées et une mémoire des poignées gardée en mémoire vive.
import { beforeEach, describe, expect, it } from "vitest";
import { DownloadStore } from "../../src/storage/downloadStore";
import type { FileStore } from "../../src/storage/fileStore";
import type { FileHandleMemory, RememberedFile } from "../../src/storage/fileHandleMemory";
import { FileSystemAccessStore } from "../../src/storage/fileSystemAccessStore";
import { type CallLog, FakeHandle, fakePickers } from "./fakeHandles";

const ID = "3b7e1f0a-2c4d-4e6f-8a9b-0c1d2e3f4a5b";
const OTHER_ID = "9f1e2d3c-4b5a-4968-8776-655443322110";

/** Mémoire des poignées en mémoire vive, à la place d'IndexedDB. */
class MapMemory implements FileHandleMemory {
  readonly handles = new Map<string, RememberedFile>();
  async remember(id: string, file: RememberedFile) {
    this.handles.set(id, file);
  }
  async recall(id: string) {
    return this.handles.get(id) ?? null;
  }
}

let log: CallLog;
let fake: ReturnType<typeof fakePickers>;
let memory: MapMemory;

beforeEach(() => {
  log = [];
  fake = fakePickers(log);
  memory = new MapMemory();
});

/** Premier lancement : le document est enregistré dans `lettre.nano`, et son fichier retenu. */
async function firstLaunch(): Promise<FakeHandle> {
  const store = new FileSystemAccessStore(fake.pickers, memory);
  const handle = new FakeHandle("lettre.nano", "", log);
  fake.state.nextSave = handle;
  await store.saveAs("v1", "document.nano");
  await store.remember(ID);
  return handle;
}

describe("FileSystemAccessStore : se souvenir du fichier (PL3)", () => {
  it("critère 1 : le fichier du document est retenu entre deux lancements, rangé sous l'id du document", async () => {
    const handle = await firstLaunch();
    expect((await memory.recall(ID))?.handle).toBe(handle);

    // Second lancement : nouvelle instance, aucun sélecteur.
    const store = new FileSystemAccessStore(fake.pickers, memory);
    expect(await store.restore(ID)).toEqual({
      name: "lettre.nano",
      needsPermission: false,
      changedElsewhere: false,
    });
    log.length = 0;
    expect(await store.save("v2")).toEqual({ status: "saved", name: "lettre.nano" });
    expect(handle.content).toBe("v2");
    expect(log).not.toContain("showSaveFilePicker");
  });

  it("critère 1 : un autre document ne retrouve pas ce fichier", async () => {
    await firstLaunch();
    const store = new FileSystemAccessStore(fake.pickers, memory);
    expect(await store.restore(OTHER_ID)).toBeNull();
  });

  it("critère 2 : si le navigateur redemande l'autorisation d'écrire, restore le signale sans rien écrire", async () => {
    const handle = await firstLaunch();
    handle.permission = "prompt";
    log.length = 0;
    const store = new FileSystemAccessStore(fake.pickers, memory);
    expect(await store.restore(ID)).toEqual({
      name: "lettre.nano",
      needsPermission: true,
      changedElsewhere: false,
    });
    expect(log).toEqual([]);
    expect(handle.content).toBe("v1");
  });

  it("critère 2 : l'autorisation est redemandée au premier enregistrement, puis le même fichier est réécrit", async () => {
    const handle = await firstLaunch();
    handle.permission = "prompt";
    const store = new FileSystemAccessStore(fake.pickers, memory);
    await store.restore(ID);
    log.length = 0;
    expect(await store.save("v2")).toEqual({ status: "saved", name: "lettre.nano" });
    expect(log[0]).toBe("requestPermission:lettre.nano");
    expect(handle.content).toBe("v2");
  });

  it("critère 3 : un fichier déplacé ou supprimé fait échouer l'enregistrement, sans rien écrire ailleurs", async () => {
    const handle = await firstLaunch();
    handle.createWritable = () => Promise.reject(new DOMException("absent", "NotFoundError"));
    const store = new FileSystemAccessStore(fake.pickers, memory);
    await store.restore(ID);
    log.length = 0;
    expect(await store.save("v2")).toEqual({ status: "failed" });
    expect(log).not.toContain("showSaveFilePicker");
  });

  it("« Ouvrir » puis remember retient le fichier ouvert", async () => {
    const store = new FileSystemAccessStore(fake.pickers, memory);
    const opened = new FakeHandle("ouvert.nano", "contenu", log);
    fake.state.nextOpen = opened;
    await store.open();
    await store.remember(ID);
    expect((await memory.recall(ID))?.handle).toBe(opened);
  });

  it("remember sans fichier courant ne retient rien", async () => {
    const store = new FileSystemAccessStore(fake.pickers, memory);
    await store.remember(ID);
    expect(memory.handles.size).toBe(0);
  });

  it("une mémoire en panne ne bloque ni remember ni restore", async () => {
    const broken: FileHandleMemory = {
      remember: () => Promise.reject(new Error("panne")),
      recall: () => Promise.reject(new Error("panne")),
    };
    const store = new FileSystemAccessStore(fake.pickers, broken);
    fake.state.nextSave = new FakeHandle("lettre.nano", "", log);
    await store.saveAs("v1", "document.nano");
    await expect(store.remember(ID)).resolves.toBeUndefined();
    await expect(store.restore(ID)).resolves.toBeNull();
  });

  it("sans mémoire (navigateur sans IndexedDB), rien n'est retenu", async () => {
    const store = new FileSystemAccessStore(fake.pickers);
    fake.state.nextSave = new FakeHandle("lettre.nano", "", log);
    await store.saveAs("v1", "document.nano");
    await store.remember(ID);
    expect(await store.restore(ID)).toBeNull();
  });
});

describe("FileSystemAccessStore : fichier modifié ailleurs entre deux lancements (PL3, relecture)", () => {
  /** Mardi, sur le PC : la même lettre est modifiée et enregistrée, puis synchronisée. */
  function changeOnOtherComputer(handle: FakeHandle) {
    handle.content = "version de mardi";
    handle.lastModified += 50;
  }

  it("lundi, mardi, mercredi : un fichier modifié ailleurs est signalé au lancement, sans rien écrire", async () => {
    // Lundi sur le Mac : enregistré, puis sauvegardé automatiquement.
    const handle = await firstLaunch();
    const monday = new FileSystemAccessStore(fake.pickers, memory);
    await monday.restore(ID);
    await monday.save("v2");
    await monday.save("v3", { onlyIfUnchanged: true });
    changeOnOtherComputer(handle);

    // Mercredi sur le Mac.
    const wednesday = new FileSystemAccessStore(fake.pickers, memory);
    expect(await wednesday.restore(ID)).toEqual({
      name: "lettre.nano",
      needsPermission: false,
      changedElsewhere: true,
    });
    expect(handle.content).toBe("version de mardi");
    // La sauvegarde automatique n'écrit pas ; « Enregistrer », choisi après l'alerte, remplace le fichier.
    expect((await wednesday.save("v4", { onlyIfUnchanged: true })).status).toBe("conflict");
    expect(handle.content).toBe("version de mardi");
    expect(await wednesday.save("v4")).toEqual({ status: "saved", name: "lettre.nano" });
    expect(handle.content).toBe("v4");
  });

  it("un fichier inchangé depuis le dernier enregistrement de Nano Buro est réécrit sans alerte au lancement", async () => {
    const handle = await firstLaunch();
    const first = new FileSystemAccessStore(fake.pickers, memory);
    await first.restore(ID);
    await first.save("v2");
    await first.save("v3", { onlyIfUnchanged: true });
    const second = new FileSystemAccessStore(fake.pickers, memory);
    expect((await second.restore(ID))?.changedElsewhere).toBe(false);
    expect(await second.save("v4")).toEqual({ status: "saved", name: "lettre.nano" });
    expect(handle.content).toBe("v4");
  });

  it("si l'autorisation manque, elle est demandée d'abord, puis la date est comparée avant d'écrire", async () => {
    const handle = await firstLaunch();
    changeOnOtherComputer(handle);
    handle.permission = "prompt";
    const store = new FileSystemAccessStore(fake.pickers, memory);
    expect(await store.restore(ID)).toEqual({
      name: "lettre.nano",
      needsPermission: true,
      changedElsewhere: false,
    });
    log.length = 0;
    expect(await store.save("v2")).toEqual({ status: "conflict", name: "lettre.nano" });
    expect(log).toEqual(["requestPermission:lettre.nano"]);
    expect(handle.content).toBe("version de mardi");
  });

  it("si l'autorisation manque et que le fichier est inchangé, « Autoriser » le réécrit", async () => {
    const handle = await firstLaunch();
    handle.permission = "prompt";
    const store = new FileSystemAccessStore(fake.pickers, memory);
    await store.restore(ID);
    expect(await store.save("v2")).toEqual({ status: "saved", name: "lettre.nano" });
    expect(handle.content).toBe("v2");
  });

  it("une date retenue inconnue compte comme une modification ailleurs", async () => {
    const handle = await firstLaunch();
    await memory.remember(ID, { handle, lastModified: null });
    const store = new FileSystemAccessStore(fake.pickers, memory);
    expect((await store.restore(ID))?.changedElsewhere).toBe(true);
    expect(handle.content).toBe("v1");
  });

  it("une date illisible au lancement compte comme une modification ailleurs", async () => {
    const handle = await firstLaunch();
    handle.getFile = () => Promise.reject(new DOMException("absent", "NotFoundError"));
    const store = new FileSystemAccessStore(fake.pickers, memory);
    expect((await store.restore(ID))?.changedElsewhere).toBe(true);
  });
});

describe("DownloadStore : se souvenir du fichier (PL3, hors périmètre de Safari et Firefox)", () => {
  it("Safari et Firefox ne retiennent aucun fichier", async () => {
    const store: FileStore = new DownloadStore();
    await store.remember(ID);
    expect(await store.restore(ID)).toBeNull();
  });
});
