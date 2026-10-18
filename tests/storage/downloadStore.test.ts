// Tests de DownloadStore, le repli par téléchargement pour Safari et Firefox (T0c, critère 8).
import { beforeEach, describe, expect, it } from "vitest";
import { DownloadStore } from "../../src/storage/downloadStore";

let downloads: { name: string; text: string }[];
let nextFile: File | null;
let store: DownloadStore;

beforeEach(() => {
  downloads = [];
  nextFile = null;
  store = new DownloadStore({
    download: (name, text) => downloads.push({ name, text }),
    pickFile: async () => nextFile,
  });
});

describe("DownloadStore", () => {
  it("canSaveInPlace est faux : le fichier ne peut pas être réécrit sur place", () => {
    expect(store.canSaveInPlace()).toBe(false);
  });

  it("critère 8 : « Enregistrer » télécharge le fichier, sous le nom document.nano par défaut", async () => {
    expect(await store.save("contenu àé 😀")).toEqual({
      status: "downloaded",
      name: "document.nano",
    });
    expect(downloads).toEqual([{ name: "document.nano", text: "contenu àé 😀" }]);
  });

  it("critère 3 : « Enregistrer sous » télécharge sous le nom proposé", async () => {
    expect(await store.saveAs("x", "lettre.nano")).toEqual({
      status: "downloaded",
      name: "lettre.nano",
    });
    expect(downloads).toEqual([{ name: "lettre.nano", text: "x" }]);
  });

  it("critère 9 : « Ouvrir » lit le fichier choisi, et « Enregistrer » le télécharge ensuite sous le même nom", async () => {
    nextFile = new File(['{"format":"nano-office"}'], "ouvert.nano");
    expect(await store.open()).toEqual({ name: "ouvert.nano", text: '{"format":"nano-office"}' });
    await store.save("modifié");
    expect(downloads).toEqual([{ name: "ouvert.nano", text: "modifié" }]);
  });

  it("annuler l'ouverture renvoie null", async () => {
    expect(await store.open()).toBeNull();
  });

  it("critère 2 : après forget, « Enregistrer » reprend le nom document.nano", async () => {
    await store.saveAs("x", "lettre.nano");
    store.forget();
    await store.save("y");
    expect(downloads.at(-1)).toEqual({ name: "document.nano", text: "y" });
  });

  it("un échec du téléchargement est signalé", async () => {
    store = new DownloadStore({
      download: () => {
        throw new Error("bloqué");
      },
      pickFile: async () => null,
    });
    expect(await store.save("x")).toEqual({ status: "failed" });
  });
});

describe("DownloadStore : fichier refusé à l'ouverture", () => {
  it("critère 15 : un fichier refusé par `accept` ne change pas le nom utilisé pour « Enregistrer »", async () => {
    await store.saveAs("x", "lettre.nano");
    nextFile = new File(["abîmé"], "abime.nano");
    await store.open(() => false);
    await store.save("y");
    expect(downloads.at(-1)).toEqual({ name: "lettre.nano", text: "y" });
  });
});
