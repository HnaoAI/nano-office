// Repli pour Safari et Firefox (T0c, critère 8) : « Enregistrer » télécharge le fichier,
// « Ouvrir » passe par un champ de choix de fichier. Fonctionne dans tous les navigateurs.
import { DEFAULT_FILE_NAME } from "../core/types";
import type { FileStore, OpenedFile, RestoredFile, SaveResult } from "./fileStore";

/** Opérations du navigateur utilisées par `DownloadStore`, remplaçables dans les tests. */
export interface DownloadDependencies {
  /** Télécharge `text` sous le nom `name`. */
  download(name: string, text: string): void;
  /** Demande un fichier à l'utilisateur ; null s'il annule. */
  pickFile(): Promise<File | null>;
}

/** Délai avant de libérer l'adresse du fichier téléchargé : Firefox la lit après le clic. */
const REVOKE_DELAY_MS = 10_000;

/** Téléchargement par un lien `<a download>` temporaire. */
function downloadWithLink(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/** Choix d'un fichier par un `<input type="file">` temporaire. L'événement `cancel` signale l'annulation. */
function pickFileWithInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".nano,application/json";
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

/**
 * Enregistrement par téléchargement : le navigateur ne permet pas de réécrire un fichier,
 * chaque enregistrement crée donc un nouveau téléchargement. Le nom du dernier fichier
 * ouvert ou enregistré est réutilisé.
 */
export class DownloadStore implements FileStore {
  private currentName: string | null = null;

  /** @param dependencies opérations du navigateur, ou de fausses opérations dans les tests */
  constructor(
    private readonly dependencies: DownloadDependencies = {
      download: downloadWithLink,
      pickFile: pickFileWithInput,
    },
  ) {}

  canSaveInPlace(): boolean {
    return false;
  }

  forget(): void {
    this.currentName = null;
  }

  /** Safari et Firefox n'ont pas de poignée de fichier à retenir (PL3, hors périmètre). */
  async remember(): Promise<void> {}

  async restore(): Promise<RestoredFile | null> {
    return null;
  }

  async open(accept?: (file: OpenedFile) => boolean): Promise<OpenedFile | null> {
    const picked = await this.dependencies.pickFile();
    if (!picked) return null;
    const file = { name: picked.name, text: await picked.text() };
    if (!accept || accept(file)) this.currentName = file.name;
    return file;
  }

  async save(text: string): Promise<SaveResult> {
    return this.saveAs(text, this.currentName ?? DEFAULT_FILE_NAME);
  }

  async saveAs(text: string, suggestedName: string): Promise<SaveResult> {
    try {
      this.dependencies.download(suggestedName, text);
    } catch {
      return { status: "failed" };
    }
    this.currentName = suggestedName;
    return { status: "downloaded", name: suggestedName };
  }
}
