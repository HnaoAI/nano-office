// Outils communs aux tests de src/core : construire un Y.Doc à partir d'un JSON et le relire.
import type * as Y from "yjs";
import { prosemirrorJSONToYDoc, yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { documentSchema, YJS_FRAGMENT_NAME } from "../../src/core/schema";
import type { DocumentJson } from "../../src/core/types";

/** Crée un Y.Doc dont le fragment du document contient `json`. */
export function ydocFromJson(json: DocumentJson): Y.Doc {
  return prosemirrorJSONToYDoc(documentSchema, json, YJS_FRAGMENT_NAME);
}

/** Relit le contenu du fragment du document d'un Y.Doc, au format JSON de Tiptap. */
export function jsonFromYdoc(ydoc: Y.Doc): DocumentJson {
  return yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment(YJS_FRAGMENT_NAME)) as DocumentJson;
}

/** Paragraphe avec identifiant, composé de morceaux de texte éventuellement mis en forme. */
export function paragraph(
  id: string,
  ...parts: { text: string; marks?: ("bold" | "italic")[] }[]
): DocumentJson {
  return {
    type: "paragraph",
    attrs: { id },
    content: parts.map((part) => ({
      type: "text",
      text: part.text,
      ...(part.marks ? { marks: part.marks.map((type) => ({ type })) } : {}),
    })),
  };
}

/** Premier paragraphe de `SAMPLE_DOCUMENT` : gras, italique et accents. */
export const FIRST_PARAGRAPH: DocumentJson = paragraph(
  "p-1",
  { text: "Bonjour " },
  { text: "Élodie", marks: ["bold"] },
  { text: ", ça va ? ", marks: ["italic"] },
  { text: "Très", marks: ["bold", "italic"] },
);

/** Document de deux paragraphes avec gras, italique, accents et emojis. */
export const SAMPLE_DOCUMENT: DocumentJson = {
  type: "doc",
  content: [FIRST_PARAGRAPH, paragraph("p-2", { text: "Œuvre à côté de l'île 👨‍👩‍👧 🇫🇷 😀" })],
};
