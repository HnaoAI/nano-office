// Tests de FileSystemAccessStore (Chrome, Edge), avec de faux sélecteurs et de fausses poignées (T0c).
import { beforeEach, describe, expect, it } from "vitest";
import { FileSystemAccessStore } from "../../src/storage/fileSystemAccessStore";
import { type CallLog, FakeHandle, fakePickers } from "./fakeHandles";

let log: CallLog;
let fake: ReturnType<typeof fakePickers>;
let store: FileSystemAccessStore;

beforeEach(() => {
  log = [];
  fake = fakePickers(log);
  store = new FileSystemAccessStore(fake.pickers);
});

describe("FileSystemAccessStore", () => {
  it("canSaveInPlace est vrai : l'API File System Access est disponible", () => {
    expect(store.canSaveInPlace()).toBe(true);
  });

  it("R1 critère 5 : le type de fichier proposé par les sélecteurs s'appelle « Document Nano Buro »", async () => {
    const expected = expect.objectContaining({
      types: [{ description: "Document Nano Buro", accept: { "application/json": [".nano"] } }],
    });
    fake.state.nextOpen = new FakeHandle("ouvert.nano", "x", log);
    await store.open();
    fake.state.nextSave = new FakeHandle("lettre.nano", "", log);
    await store.saveAs("contenu", "document.nano");
    expect(fake.state.openOptions[0]).toEqual(expected);
    expect(fake.state.saveOptions[0]).toEqual(expected);
  });

  it("critère 3 : « Enregistrer sous » propose le nom suggéré et laisse choisir l'emplacement", async () => {
    fake.state.nextSave = new FakeHandle("lettre.nano", "", log);
    const result = await store.saveAs("contenu", "document.nano");
    expect(result).toEqual({ status: "saved", name: "lettre.nano" });
    expect(fake.state.saveOptions[0]).toEqual(
      expect.objectContaining({ suggestedName: "document.nano" }),
    );
    expect(fake.state.nextSave.content).toBe("contenu");
  });

  it("critère 4 : après un premier enregistrement, « Enregistrer » réécrit le même fichier sans rien demander", async () => {
    const handle = new FakeHandle("lettre.nano", "", log);
    fake.state.nextSave = handle;
    await store.saveAs("v1", "document.nano");
    fake.state.nextSave = null;
    log.length = 0;

    const result = await store.save("v2 àé 😀");
    expect(result).toEqual({ status: "saved", name: "lettre.nano" });
    expect(handle.content).toBe("v2 àé 😀");
    expect(log).not.toContain("showSaveFilePicker");
  });

  it("critère 5 : « Ouvrir » utilise showOpenFilePicker, puis « Enregistrer » réécrit le fichier ouvert", async () => {
    const handle = new FakeHandle("ouvert.nano", "texte d'origine", log);
    fake.state.nextOpen = handle;
    expect(await store.open()).toEqual({ name: "ouvert.nano", text: "texte d'origine" });
    expect(log).toEqual(["showOpenFilePicker"]);

    expect(await store.save("modifié")).toEqual({ status: "saved", name: "ouvert.nano" });
    expect(handle.content).toBe("modifié");
    expect(log).not.toContain("showSaveFilePicker");
  });

  it("critère 5 : le navigateur peut demander une fois l'autorisation d'écrire dans le fichier ouvert", async () => {
    const handle = new FakeHandle("ouvert.nano", "x", log);
    handle.permission = "prompt";
    fake.state.nextOpen = handle;
    await store.open();
    await store.save("a");
    await store.save("b");
    expect(log.filter((entry) => entry.startsWith("requestPermission"))).toHaveLength(1);
    expect(handle.content).toBe("b");
  });

  it("critère 5 : si l'autorisation d'écrire est refusée, rien n'est écrit et l'échec est signalé", async () => {
    const handle = new FakeHandle("ouvert.nano", "x", log);
    handle.permission = "denied";
    handle.requestPermission = async () => "denied";
    fake.state.nextOpen = handle;
    await store.open();
    expect(await store.save("a")).toEqual({ status: "failed" });
    expect(handle.content).toBe("x");
  });

  it("critère 2 : après forget, « Enregistrer » demande un emplacement", async () => {
    fake.state.nextOpen = new FakeHandle("ouvert.nano", "x", log);
    await store.open();
    store.forget();
    const other = new FakeHandle("nouveau.nano", "", log);
    fake.state.nextSave = other;

    expect(await store.save("neuf")).toEqual({ status: "saved", name: "nouveau.nano" });
    expect(log).toContain("showSaveFilePicker");
    expect(fake.state.saveOptions[0]).toEqual(
      expect.objectContaining({ suggestedName: "document.nano" }),
    );
    expect(other.content).toBe("neuf");
  });

  it("critère 7 : l'écriture passe par createWritable(), write() puis close()", async () => {
    fake.state.nextSave = new FakeHandle("a.nano", "", log);
    await store.saveAs("contenu", "a.nano");
    expect(log).toEqual([
      "showSaveFilePicker",
      "createWritable:a.nano",
      "write:a.nano",
      "close:a.nano",
    ]);
  });

  it("critère 7 : si l'écriture échoue, le flux est abandonné sans close() et le fichier reste intact", async () => {
    const handle = new FakeHandle("a.nano", "original", log);
    fake.state.nextOpen = handle;
    await store.open();
    handle.createWritable = async () => ({
      write: async () => {
        throw new Error("disque plein");
      },
      close: async () => {
        log.push("close");
      },
      abort: async () => {
        log.push("abort");
      },
    });
    expect(await store.save("nouveau")).toEqual({ status: "failed" });
    expect(log).toContain("abort");
    expect(log).not.toContain("close");
    expect(handle.content).toBe("original");
  });

  it("annuler le sélecteur d'ouverture renvoie null et garde le fichier courant", async () => {
    const handle = new FakeHandle("ouvert.nano", "x", log);
    fake.state.nextOpen = handle;
    await store.open();
    fake.state.nextOpen = null;
    expect(await store.open()).toBeNull();
    await store.save("y");
    expect(handle.content).toBe("y");
  });

  it("annuler « Enregistrer sous » renvoie cancelled sans rien écrire", async () => {
    expect(await store.saveAs("x", "document.nano")).toEqual({ status: "cancelled" });
    expect(log).toEqual(["showSaveFilePicker"]);
  });

  it("une erreur du sélecteur autre qu'une annulation est signalée comme un échec", async () => {
    fake.pickers.showSaveFilePicker = async () => {
      throw new Error("SecurityError");
    };
    expect(await store.saveAs("x", "document.nano")).toEqual({ status: "failed" });
  });
});

describe("FileSystemAccessStore : fichier refusé à l'ouverture", () => {
  it("critère 15 : un fichier refusé par `accept` ne devient pas le fichier courant et n'est jamais réécrit", async () => {
    const current = new FakeHandle("courant.nano", "", log);
    fake.state.nextSave = current;
    await store.saveAs("v1", "document.nano");
    const damaged = new FakeHandle("abime.nano", "abîmé", log);
    fake.state.nextOpen = damaged;

    expect(await store.open(() => false)).toEqual({ name: "abime.nano", text: "abîmé" });
    expect(await store.save("v2")).toEqual({ status: "saved", name: "courant.nano" });
    expect(damaged.content).toBe("abîmé");
    expect(current.content).toBe("v2");
  });

  it("critère 9 : un fichier accepté par `accept` devient le fichier courant", async () => {
    const opened = new FakeHandle("ouvert.nano", "ok", log);
    fake.state.nextOpen = opened;
    await store.open(() => true);
    await store.save("nouveau");
    expect(opened.content).toBe("nouveau");
  });
});
