// Ouverture et enregistrement d'un document (T0c), sans accès au navigateur :
// nouveau document, lecture d'un fichier avec un message clair, modifications non enregistrées,
// titre de la fenêtre et nom du document affiché (U1a).
import * as Y from "yjs";
import { contentOf, createDocumentId, parseDocument } from "./fileFormat";
import { IMAGE_NODE, imageRefs, readImage } from "./images";
import { DEFAULT_FILE_NAME, type DocumentJson, type OpenDocument, type ParseError } from "./types";

export { DEFAULT_FILE_NAME };

/** Message d'un fichier abîmé (T0c, critère 15), volontairement rassurant : le fichier peut être récupéré plus tard (#15). */
export const CORRUPTED_FILE_MESSAGE =
  "Ce fichier est abîmé et ne peut pas être ouvert. Il n'a pas été modifié.";

/** Message affiché pour chaque erreur de lecture (T0c, critère 12), repris par l'aide (A1). */
export const PARSE_ERROR_MESSAGES: Record<ParseError, string> = {
  "invalid-json": "Ce fichier n'est pas un document Nano Buro.",
  "not-nano": "Ce fichier n'est pas un document Nano Buro.",
  "unsupported-version":
    "Ce document vient d'une version de Nano Buro que cette application ne sait pas lire. Mettez Nano Buro à jour pour l'ouvrir.",
  corrupted: CORRUPTED_FILE_MESSAGE,
};

/** Nom affiché pour un document jamais enregistré. */
const UNTITLED = "Sans titre";

/** Crée un document vide, avec un nouvel `id` et un nouveau Y.Doc (critère 1). */
export function createNewDocument(): OpenDocument {
  return { id: createDocumentId(), ydoc: new Y.Doc(), fileName: null, savedSnapshot: null };
}

/**
 * Lit le texte d'un fichier `.nano`. Ne lève jamais d'exception.
 * Le document renvoyé a toujours un Y.Doc neuf (critère 9), à relier à un nouvel éditeur (critère 10).
 * @param fileName nom du fichier, affiché dans le titre
 * @returns le document, ou un message en français à afficher (critères 12 et 15)
 */
export function openDocumentText(
  fileName: string,
  text: string,
): { ok: true; document: OpenDocument } | { ok: false; message: string } {
  const result = parseDocument(text);
  if (!result.ok) return { ok: false, message: PARSE_ERROR_MESSAGES[result.error] };
  return {
    ok: true,
    document: {
      id: result.id,
      ydoc: result.ydoc,
      fileName,
      savedSnapshot: contentSnapshot(result.ydoc),
    },
  };
}

/**
 * Empreinte du contenu d'un document, comparée à celle du dernier enregistrement.
 * On compare le contenu plutôt que de compter les mises à jour Yjs : l'éditeur écrit lui-même
 * dans le Y.Doc à l'ouverture (paragraphe vide, identifiants de bloc), ce qui n'est pas une modification.
 */
export function contentSnapshot(ydoc: Y.Doc): string {
  const content = contentOf(ydoc);
  // Une image manquante qu'on remet (même empreinte) ne change pas `content` : on note donc les
  // images manquantes, pour que leur retour compte comme une modification à enregistrer (T1.9).
  const missing = imageRefs(content).filter((hash) => readImage(ydoc, hash) === null);
  return JSON.stringify(missing.length > 0 ? { content, missing } : content);
}

/**
 * Document marqué comme enregistré sous `fileName`. Garde le même `id` et le même Y.Doc.
 * @param snapshot empreinte prise avant l'écriture ; par défaut, celle du contenu actuel.
 *   La prendre avant l'écriture évite d'oublier une saisie faite pendant l'enregistrement.
 */
export function markSaved(
  document: OpenDocument,
  fileName: string,
  snapshot = contentSnapshot(document.ydoc),
): OpenDocument {
  return { ...document, fileName, savedSnapshot: snapshot };
}

/**
 * Vrai si le document a des modifications non enregistrées.
 * Un document jamais enregistré n'en a que s'il contient du texte, une image (T1.9, critère 8) ou une
 * mise en page réglée (T2.5) :
 * le paragraphe vide créé par l'éditeur ne compte pas, pour ne pas demander de confirmation sur une
 * page blanche.
 */
export function hasUnsavedChanges(document: OpenDocument): boolean {
  if (document.savedSnapshot === null) return hasContent(contentOf(document.ydoc));
  return contentSnapshot(document.ydoc) !== document.savedSnapshot;
}

/** Titre de la fenêtre : nom du fichier, précédé de `•` s'il y a des modifications non enregistrées (critère 13). */
export function windowTitle(fileName: string | null, unsaved: boolean): string {
  return `${unsaved ? "• " : ""}${fileName ?? UNTITLED} - Nano Buro`;
}

/**
 * Nom du document affiché dans l'en-tête (U1a, critères 1 et 2) : le nom du fichier sans l'extension
 * `.nano`, ou « Sans titre » pour un document jamais enregistré.
 * @param fileName nom du fichier, ou null
 */
export function documentTitle(fileName: string | null): string {
  if (fileName === null) return UNTITLED;
  return fileName.replace(/\.nano$/i, "") || fileName;
}

/**
 * Indique si un document contient au moins un caractère de texte ou une image, à n'importe quelle
 * profondeur. Une image seule compte : sinon, une page qui n'a qu'une photo ne serait ni restaurée
 * au rechargement ni protégée par l'alerte avant fermeture (T1.9, critère 8).
 */
function hasContent(node: DocumentJson): boolean {
  // Une mise en page réglée (attributs du nœud `doc`) compte aussi (T2.5, critère 5).
  if (node.type === "doc" && node.attrs && Object.keys(node.attrs).length > 0) return true;
  return Boolean(node.text) || node.type === IMAGE_NODE || (node.content ?? []).some(hasContent);
}
