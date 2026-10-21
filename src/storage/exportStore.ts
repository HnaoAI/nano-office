// Écriture d'un fichier exporté (T2.7 : `.docx`), à côté du fichier `.nano` : un sélecteur sur Chrome et
// Edge (API File System Access), un téléchargement ailleurs. Ne touche jamais au fichier courant de
// `FileStore` : Ctrl/Cmd+S continue d'enregistrer le `.nano` (critère 1).
// INVARIANT : seul un fichier de l'extension exportée est écrit, pour qu'un export ne puisse jamais
// remplacer un `.nano` choisi par erreur dans le sélecteur.

/** Fichier à exporter. */
export interface ExportFile {
  /** Nom proposé, extension comprise (`lettre.docx`). */
  suggestedName: string;
  data: Uint8Array;
  /** Type MIME et extension, pour le filtre du sélecteur. */
  mime: string;
  extension: string;
  /** Description du type de fichier, affichée par le sélecteur (« Document Word »). */
  description: string;
}

/**
 * Résultat d'un export. Ne lève jamais d'exception : `saved` (écrit sur le disque), `downloaded`
 * (repli de Safari et Firefox), `cancelled` (sélecteur fermé), `wrongType` (fichier choisi d'une autre
 * extension, rien n'est écrit) ou `failed`.
 */
export type ExportResult =
  | { status: "saved"; name: string }
  | { status: "downloaded"; name: string }
  | { status: "cancelled" }
  | { status: "wrongType"; name: string }
  | { status: "failed" };

/** Partie de `FileSystemFileHandle` utilisée ici. */
interface ExportHandle {
  readonly name: string;
  createWritable(): Promise<{
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
}

/** Ce que l'export regarde dans le navigateur (en pratique `window`), remplaçable dans les tests. */
export interface ExportEnvironment {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
    excludeAcceptAllOption?: boolean;
  }) => Promise<ExportHandle>;
  /** Téléchargement de repli ; par défaut, un lien `<a download>` temporaire. */
  download?: (name: string, blob: Blob) => void;
}

/** Délai avant de libérer l'adresse du fichier téléchargé : Firefox la lit après le clic. */
const REVOKE_DELAY_MS = 10_000;

function downloadWithLink(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/**
 * Propose d'enregistrer un fichier exporté et l'écrit d'un coup (`createWritable()` puis `close()`).
 * @param file contenu et nom proposé
 * @param environment navigateur, ou faux navigateur dans les tests
 */
export async function exportFile(
  file: ExportFile,
  environment: ExportEnvironment = window as unknown as ExportEnvironment,
): Promise<ExportResult> {
  const blob = new Blob([file.data as BlobPart], { type: file.mime });
  const picker = environment.showSaveFilePicker;
  if (typeof picker !== "function") {
    try {
      (environment.download ?? downloadWithLink)(file.suggestedName, blob);
      return { status: "downloaded", name: file.suggestedName };
    } catch {
      return { status: "failed" };
    }
  }
  let handle: ExportHandle;
  try {
    handle = await picker.call(environment, {
      suggestedName: file.suggestedName,
      types: [{ description: file.description, accept: { [file.mime]: [file.extension] } }],
      // Pas de choix « Tous les fichiers » : un `.nano` n'apparaît pas dans le sélecteur.
      excludeAcceptAllOption: true,
    });
  } catch (error) {
    return error instanceof Error && error.name === "AbortError"
      ? { status: "cancelled" }
      : { status: "failed" };
  }
  // Un nom tapé à la main peut encore viser un autre fichier : rien n'est ouvert en écriture.
  if (!handle.name.toLowerCase().endsWith(file.extension.toLowerCase())) {
    return { status: "wrongType", name: handle.name };
  }
  try {
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
  } catch {
    return { status: "failed" };
  }
  return { status: "saved", name: handle.name };
}
