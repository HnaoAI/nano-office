// Tests de la protection contre l'écrasement d'un fichier modifié ailleurs (T1.6, décision du PO à la
// relecture de la PR 43), avec FileSystemAccessStore, de faux sélecteurs et de fausses poignées dont le
// fichier change sur le « disque ».
import { beforeEach, describe, expect, it } from "vitest";
import { FileSystemAccessStore } from "../../src/storage/fileSystemAccessStore";
import { type CallLog, FakeHandle, fakePickers } from "./fakeHandles";

const AUTO = { onlyIfUnchanged: true };

let log: CallLog;
let fake: ReturnType<typeof fakePickers>;
let store: FileSystemAccessStore;

beforeEach(() => {
  log = [];
  fake = fakePickers(log);
  store = new FileSystemAccessStore(fake.pickers);
});

/** Ouvre `lettre.nano` avec « Ouvrir ». */
async function openLetter(): Promise<FakeHandle> {
  const handle = new FakeHandle("lettre.nano", "v1", log);
  fake.state.nextOpen = handle;
  await store.open();
  return handle;
}

/** Le fichier est enregistré sur l'autre ordinateur, puis synchronisé. */
function changeElsewhere(handle: FakeHandle) {
  handle.content = "version du PC";
  handle.lastModified += 50;
}

function writes(): string[] {
  return log.filter((step) => step.startsWith("createWritable"));
}

describe("FileSystemAccessStore : fichier modifié ailleurs (T1.6)", () => {
  it("un fichier ouvert puis modifié ailleurs n'est pas écrasé par la sauvegarde automatique", async () => {
    const handle = await openLetter();
    changeElsewhere(handle);
    log.length = 0;
    expect(await store.save("v2", AUTO)).toEqual({ status: "conflict", name: "lettre.nano" });
    expect(handle.content).toBe("version du PC");
    expect(writes()).toEqual([]);
  });

  it("un fichier créé par « Enregistrer sous » puis modifié ailleurs n'est pas écrasé", async () => {
    const handle = new FakeHandle("lettre.nano", "", log);
    fake.state.nextSave = handle;
    await store.saveAs("v1", "document.nano");
    changeElsewhere(handle);
    expect(await store.save("v2", AUTO)).toEqual({ status: "conflict", name: "lettre.nano" });
    expect(handle.content).toBe("version du PC");
  });

  it("un fichier modifié ailleurs après une sauvegarde automatique n'est pas écrasé par la suivante", async () => {
    const handle = await openLetter();
    expect(await store.save("v2", AUTO)).toEqual({ status: "saved", name: "lettre.nano" });
    changeElsewhere(handle);
    expect(await store.save("v3", AUTO)).toEqual({ status: "conflict", name: "lettre.nano" });
    expect(handle.content).toBe("version du PC");
  });

  it("les écritures successives de Nano Buro ne sont pas prises pour une modification ailleurs", async () => {
    const handle = await openLetter();
    for (const text of ["v2", "v3", "v4"]) {
      expect(await store.save(text, AUTO)).toEqual({ status: "saved", name: "lettre.nano" });
    }
    expect(await store.save("v5")).toEqual({ status: "saved", name: "lettre.nano" });
    expect(await store.save("v6", AUTO)).toEqual({ status: "saved", name: "lettre.nano" });
    expect(handle.content).toBe("v6");
  });

  it("« Enregistrer » manuel reste un choix explicite : il remplace le fichier, puis la sauvegarde automatique reprend", async () => {
    const handle = await openLetter();
    changeElsewhere(handle);
    expect(await store.save("v2")).toEqual({ status: "saved", name: "lettre.nano" });
    expect(handle.content).toBe("v2");
    expect(await store.save("v3", AUTO)).toEqual({ status: "saved", name: "lettre.nano" });
    expect(handle.content).toBe("v3");
  });

  it("« Enregistrer sous » reste possible après un conflit, dans un autre fichier", async () => {
    const handle = await openLetter();
    changeElsewhere(handle);
    expect((await store.save("v2", AUTO)).status).toBe("conflict");
    const other = new FakeHandle("lettre-mac.nano", "", log);
    fake.state.nextSave = other;
    expect(await store.saveAs("v2", "lettre.nano")).toEqual({
      status: "saved",
      name: "lettre-mac.nano",
    });
    expect(await store.save("v3", AUTO)).toEqual({ status: "saved", name: "lettre-mac.nano" });
    expect(handle.content).toBe("version du PC");
  });

  it("si la date du fichier ne peut pas être lue, la sauvegarde automatique n'écrit pas", async () => {
    const handle = await openLetter();
    handle.getFile = () => Promise.reject(new DOMException("absent", "NotFoundError"));
    expect(await store.save("v2", AUTO)).toEqual({ status: "conflict", name: "lettre.nano" });
    expect(writes()).toEqual([]);
  });

  it("sans fichier courant, la sauvegarde automatique n'ouvre jamais de sélecteur", async () => {
    expect(await store.save("v1", AUTO)).toEqual({ status: "failed" });
    expect(log).toEqual([]);
  });

  it("au lancement (PL3), le fichier retrouvé n'est pas réécrit automatiquement avant un « Enregistrer »", async () => {
    const handle = new FakeHandle("lettre.nano", "v1", log);
    const memory = {
      remember: async () => undefined,
      recall: async () => handle,
    };
    const restored = new FileSystemAccessStore(fake.pickers, memory);
    await restored.restore("id");
    expect((await restored.save("v2", AUTO)).status).toBe("conflict");
    expect(await restored.save("v2")).toEqual({ status: "saved", name: "lettre.nano" });
    expect(await restored.save("v3", AUTO)).toEqual({ status: "saved", name: "lettre.nano" });
  });
});
