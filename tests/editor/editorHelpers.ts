// Outils communs aux tests de src/editor dans jsdom (lots A et C) : éditeur sans affichage avec le
// schéma du document, collage par le chemin de ProseMirror, copie de tout le contenu.
import { Editor } from "@tiptap/core";
import { documentExtensions } from "../../src/core/schema";
import type { DocumentJson } from "../../src/core/types";
import { BlockIdGenerator } from "../../src/editor/blockIds";
import { CleanClipboard } from "../../src/editor/clipboard";
import { Search } from "../../src/editor/search";
import { TableNavigation } from "../../src/editor/tables";

/** Éditeur avec le schéma, les identifiants de bloc, le copier-coller propre et la recherche (T2.1). */
export function createTestEditor(content?: DocumentJson): Editor {
  return new Editor({
    element: document.createElement("div"),
    extensions: [...documentExtensions, BlockIdGenerator, CleanClipboard, TableNavigation, Search],
    enableInputRules: false,
    enablePasteRules: false,
    ...(content ? { content } : {}),
  });
}

/** Colle du HTML par le chemin de collage de ProseMirror (jsdom n'a pas de ClipboardEvent). */
export function pasteHtml(target: Editor, html: string): boolean {
  return target.view.pasteHTML(html, new Event("paste") as ClipboardEvent);
}

/** Ce que l'éditeur mettrait dans le presse-papiers pour tout son contenu. */
export function copyAll(source: Editor): { html: string; text: string } {
  const { dom, text } = source.view.serializeForClipboard(source.state.doc.slice(0));
  return { html: dom.innerHTML, text };
}

/** Morceau de texte avec ses marques (nom seul, ou nom et attributs). */
export function textNode(
  value: string,
  ...marks: (string | { type: string; attrs: Record<string, unknown> })[]
): DocumentJson {
  return {
    type: "text",
    text: value,
    ...(marks.length > 0
      ? { marks: marks.map((mark) => (typeof mark === "string" ? { type: mark } : mark)) }
      : {}),
  };
}

/** Document d'un seul paragraphe. */
export function docOf(...content: DocumentJson[]): DocumentJson {
  return { type: "doc", content: [{ type: "paragraph", attrs: { id: "p-1" }, content }] };
}
