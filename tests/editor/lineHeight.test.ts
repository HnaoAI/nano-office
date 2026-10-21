// @vitest-environment jsdom
// Tests de l'interligne dans l'éditeur (src/editor/lineHeight.ts, T2.2) : application aux blocs
// sélectionnés, lecture au curseur, copier-coller interne et extérieur.
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { DocumentJson } from "../../src/core/types";
import { currentLineHeight, setLineHeight } from "../../src/editor/lineHeight";
import { copyAll, createTestEditor, pasteHtml } from "./editorHelpers";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

const para = (id: string, text: string, attrs: object = {}): DocumentJson => ({
  type: "paragraph",
  attrs: { id, ...attrs },
  content: [{ type: "text", text }],
});

const DOC: DocumentJson = {
  type: "doc",
  content: [
    { type: "heading", attrs: { id: "h-1", level: 1 }, content: [{ type: "text", text: "Titre" }] },
    para("p-1", "Premier"),
    {
      type: "bulletList",
      content: [{ type: "listItem", attrs: { id: "li-1" }, content: [para("p-2", "Élément")] }],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [{ type: "tableCell", attrs: { id: "c-1" }, content: [para("p-3", "Cellule")] }],
        },
      ],
    },
    para("p-4", "Dernier"),
  ],
};

function start(content: DocumentJson = DOC): Editor {
  editor = createTestEditor(content);
  return editor;
}

/** Interligne de chaque bloc de texte, dans l'ordre. */
function lineHeights(target: Editor): (string | null)[] {
  const values: (string | null)[] = [];
  target.state.doc.descendants((node) => {
    if (node.isTextblock) values.push(node.attrs.lineHeight as string | null);
    return true;
  });
  return values;
}

/** Place le curseur dans le texte `fragment`. */
function cursorIn(target: Editor, fragment: string): void {
  let at = -1;
  target.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text?.includes(fragment)) at = pos + 1;
    return at < 0;
  });
  target.view.dispatch(target.state.tr.setSelection(TextSelection.create(target.state.doc, at)));
}

describe("T2.2 : interligne dans l'éditeur", () => {
  it("critère 2 : sans sélection, s'applique au paragraphe du curseur", () => {
    const target = start();
    cursorIn(target, "Premier");
    setLineHeight(target, "1.5");
    expect(lineHeights(target)).toEqual([null, "1.5", null, null, null]);
  });

  it("critère 2 : s'applique aux titres, éléments de liste et cellules sélectionnés", () => {
    const target = start();
    target.commands.selectAll();
    setLineHeight(target, "2");
    expect(lineHeights(target)).toEqual(["2", "2", "2", "2", "2"]);
    expect(target.getHTML()).toContain("line-height: 2.4");
  });

  it("critère 2 : s'applique au texte d'une cellule", () => {
    const target = start();
    cursorIn(target, "Cellule");
    setLineHeight(target, "1.15");
    expect(lineHeights(target)).toEqual([null, null, null, "1.15", null]);
  });

  it("critère 4 : Par défaut retire l'attribut", () => {
    const target = start({ type: "doc", content: [para("p-1", "Texte", { lineHeight: "2" })] });
    cursorIn(target, "Texte");
    setLineHeight(target, null);
    expect(lineHeights(target)).toEqual([null]);
    expect(target.getHTML()).not.toContain("line-height");
  });

  it("critère 5 : la liste montre l'interligne du curseur, et null pour une sélection mélangée", () => {
    const target = start({
      type: "doc",
      content: [para("p-1", "Un", { lineHeight: "1.5" }), para("p-2", "Deux")],
    });
    cursorIn(target, "Un");
    expect(currentLineHeight(target.state)).toBe("1.5");
    cursorIn(target, "Deux");
    expect(currentLineHeight(target.state)).toBe("default");
    target.commands.selectAll();
    expect(currentLineHeight(target.state)).toBeNull();
  });

  it("Entrée garde l'interligne dans le paragraphe suivant", () => {
    const target = start({ type: "doc", content: [para("p-1", "Texte", { lineHeight: "1.5" })] });
    target.commands.setTextSelection(6);
    target.commands.splitBlock();
    expect(lineHeights(target)).toEqual(["1.5", "1.5"]);
  });

  it("critère 6 : gardé dans un copier-coller interne", () => {
    const source = start({ type: "doc", content: [para("p-1", "Copié", { lineHeight: "1.5" })] });
    const target = createTestEditor();
    pasteHtml(target, copyAll(source).html);
    expect(lineHeights(target)).toContain("1.5");
    target.destroy();
  });

  it("critère 6 : retiré d'un collage extérieur", () => {
    const target = start({ type: "doc", content: [para("p-1", "")] });
    pasteHtml(
      target,
      '<p style="line-height: 2" data-line-height="2">Un</p><p style="line-height: 3">Deux</p>',
    );
    expect(lineHeights(target).every((value) => value === null)).toBe(true);
  });
});
