// @vitest-environment jsdom
// Sommaire dans l'éditeur (T2.17) : insertion au curseur en une étape d'annulation, paragraphe après un
// sommaire final, identifiant du bloc, lignes mises à jour à chaque changement des titres, ancres des titres.
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { DocumentJson } from "../../src/core/types";
import { createEditorOptions } from "../../src/editor/editorOptions";
import { EMPTY_TOC_TEXT, insertTableOfContents, tocState } from "../../src/editor/toc";
import { ydocFromJson } from "../core/helpers";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function para(id: string, value: string): DocumentJson {
  return {
    type: "paragraph",
    attrs: { id },
    content: value ? [{ type: "text", text: value }] : [],
  };
}

function heading(id: string, level: number, value: string): DocumentJson {
  return { type: "heading", attrs: { id, level }, content: [{ type: "text", text: value }] };
}

/** Éditeur relié à un Y.Doc, comme dans l'application (sommaire de l'éditeur, annulation de Yjs). */
function create(...content: DocumentJson[]): Editor {
  const ydoc = ydocFromJson({ type: "doc", content });
  editor = new Editor({ element: document.createElement("div"), ...createEditorOptions(ydoc) });
  return editor;
}

/** Types et textes des blocs de premier niveau (« ☰ » pour un sommaire). */
function blocks(target: Editor): string[] {
  const out: string[] = [];
  target.state.doc.forEach((node) => {
    out.push(node.type.name === "tableOfContents" ? "☰" : `${node.type.name}:${node.textContent}`);
  });
  return out;
}

/** Place le curseur après le `offset`-ième caractère du bloc de premier niveau `index`. */
function cursorIn(target: Editor, index: number, offset: number) {
  let pos = 0;
  target.state.doc.forEach((_node, nodePos, nodeIndex) => {
    if (nodeIndex === index) pos = nodePos + 1 + offset;
  });
  target.view.dispatch(target.state.tr.setSelection(TextSelection.create(target.state.doc, pos)));
}

describe("T2.17 : sommaire dans l'éditeur", () => {
  it("critère 1 : au milieu d'un paragraphe, le sommaire coupe le paragraphe en deux, curseur après", () => {
    const target = create(para("p-1", "AvantAprès"));
    cursorIn(target, 0, 5);
    expect(insertTableOfContents(target)).toBe(true);
    expect(blocks(target)).toEqual(["paragraph:Avant", "☰", "paragraph:Après"]);
    expect(target.state.selection.$from.parent.textContent).toBe("Après");
    expect(target.state.selection.$from.parentOffset).toBe(0);
  });

  it("critère 1 : au début d'un paragraphe, le sommaire se place avant lui", () => {
    const target = create(para("p-1", "Texte"));
    cursorIn(target, 0, 0);
    insertTableOfContents(target);
    expect(blocks(target)).toEqual(["☰", "paragraph:Texte"]);
  });

  it("critère 1 : à la fin du document, un paragraphe vide suit le sommaire pour continuer à écrire", () => {
    const target = create(para("p-1", "Texte"));
    cursorIn(target, 0, 5);
    insertTableOfContents(target);
    expect(blocks(target)).toEqual(["paragraph:Texte", "☰", "paragraph:"]);
    expect(target.state.selection.$from.parent.textContent).toBe("");
  });

  it("critère 1 : une seule annulation retire le sommaire et rend le paragraphe d'origine", () => {
    const target = create(para("p-1", "AvantAprès"));
    cursorIn(target, 0, 5);
    insertTableOfContents(target);
    target.commands.undo();
    expect(blocks(target)).toEqual(["paragraph:AvantAprès"]);
  });

  it("critère 4 : le sommaire reçoit un identifiant de bloc stable", () => {
    const target = create(para("p-1", "Texte"));
    cursorIn(target, 0, 0);
    insertTableOfContents(target);
    const toc = target.state.doc.firstChild;
    expect(toc?.type.name).toBe("tableOfContents");
    expect(typeof toc?.attrs.id).toBe("string");
    expect(toc?.attrs.id).not.toBe("");
  });

  it("critère 4 : un sommaire qui termine le document est toujours suivi d'un paragraphe", () => {
    const target = create(
      para("p-1", "Texte"),
      { type: "tableOfContents", attrs: { id: "t" } },
      para("p-2", ""),
    );
    const last = target.state.doc.lastChild;
    if (!last) throw new Error("document vide");
    target.view.dispatch(
      target.state.tr.delete(
        target.state.doc.content.size - last.nodeSize,
        target.state.doc.content.size,
      ),
    );
    expect(blocks(target)).toEqual(["paragraph:Texte", "☰", "paragraph:"]);
  });

  it("critère 3 : les lignes suivent les titres du document à chaque modification", () => {
    const target = create(
      { type: "tableOfContents", attrs: { id: "t" } },
      heading("h-1", 1, "Début"),
      heading("h-2", 2, "Été"),
    );
    const state = tocState(target);
    expect(state?.entries.map((entry) => entry.text)).toEqual(["Début", "Été"]);
    const dom = target.view.dom.querySelector(".nano-toc");
    expect(dom?.querySelectorAll(".nano-toc-entry")).toHaveLength(2);
    expect(dom?.querySelector('.nano-toc-entry[data-level="2"] .nano-toc-text')?.textContent).toBe(
      "Été",
    );
    // Renommer un titre change sa ligne.
    cursorIn(target, 1, 5);
    target.commands.insertContent(" 🌬️");
    expect(dom?.querySelector(".nano-toc-text")?.textContent).toBe("Début 🌬️");
    // Un nouveau titre ajoute une ligne.
    target.commands.setContent({
      type: "doc",
      content: [{ type: "tableOfContents", attrs: { id: "t" } }, para("p", "Sans titre")],
    });
    const after = target.view.dom.querySelector(".nano-toc");
    expect(after?.querySelectorAll(".nano-toc-entry")).toHaveLength(0);
    expect(after?.querySelector(".nano-toc-empty")?.textContent).toBe(EMPTY_TOC_TEXT);
  });

  it("critère 3 : les numéros de page s'affichent en fin de ligne", () => {
    const target = create(
      { type: "tableOfContents", attrs: { id: "t" } },
      heading("h-1", 1, "Début"),
    );
    tocState(target)?.setPages(new Map([["h-1", 4]]));
    expect(target.view.dom.querySelector(".nano-toc-page")?.textContent).toBe("4");
  });

  it("critère 5 : chaque titre a une ancre quand le document contient un sommaire, et seulement alors", () => {
    const target = create(heading("h-1", 1, "Début"));
    expect(target.view.dom.querySelector("#titre-h-1")).toBeNull();
    cursorIn(target, 0, 0);
    insertTableOfContents(target);
    expect(target.view.dom.querySelector("#titre-h-1")?.textContent).toBe("Début");
    const link = target.view.dom.querySelector(".nano-toc-entry a");
    expect(link?.getAttribute("href")).toBe("#titre-h-1");
  });
});
