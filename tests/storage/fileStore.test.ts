// Tests du choix de l'implémentation de FileStore selon le navigateur (T0c).
import { describe, expect, it } from "vitest";
import { DownloadStore } from "../../src/storage/downloadStore";
import { selectFileStore } from "../../src/storage/fileStore";
import { FileSystemAccessStore } from "../../src/storage/fileSystemAccessStore";

const picker = async () => {
  throw new Error("non utilisé");
};

describe("selectFileStore", () => {
  it("critère 4 : Chrome et Edge (les deux sélecteurs existent) utilisent l'API File System Access", () => {
    const store = selectFileStore({ showOpenFilePicker: picker, showSaveFilePicker: picker });
    expect(store).toBeInstanceOf(FileSystemAccessStore);
    expect(store.canSaveInPlace()).toBe(true);
  });

  it("critère 8 : Safari et Firefox (sans sélecteurs) se replient sur le téléchargement", () => {
    const store = selectFileStore({});
    expect(store).toBeInstanceOf(DownloadStore);
    expect(store.canSaveInPlace()).toBe(false);
  });

  it("critère 8 : un navigateur qui n'a que le sélecteur d'ouverture se replie aussi sur le téléchargement", () => {
    expect(selectFileStore({ showOpenFilePicker: picker })).toBeInstanceOf(DownloadStore);
  });
});
