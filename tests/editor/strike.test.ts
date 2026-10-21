// @vitest-environment jsdom
// Tests du barré (T2.3) dans jsdom : marque du schéma, cumul avec les autres mises en forme,
// copier-coller interne et extérieur, HTML copié vers un e-mail.
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import { documentSchema } from "../../src/core/schema";
import { formatShortcuts } from "../../src/editor/keyboardShortcuts";
import { copyAll, createTestEditor, docOf, pasteHtml, textNode } from "./editorHelpers";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function start(content = docOf(textNode("Acheter du pain"))): Editor {
  editor = createTestEditor(content);
  return editor;
}

/** Noms des marques du morceau de texte qui contient `fragment`. */
function marksOf(target: Editor, fragment: string): string[] {
  let found: string[] | null = null;
  target.state.doc.descendants((node) => {
    if (node.isText && node.text?.includes(fragment)) {
      found = node.marks.map((mark) => mark.type.name).sort();
    }
    return true;
  });
  if (!found) throw new Error(`texte absent : ${fragment}`);
  return found;
}

describe("T2.3 : barré", () => {
  it("le schéma du document connaît la marque « strike »", () => {
    expect(documentSchema.marks.strike).toBeDefined();
  });

  it("critère 2 : le raccourci est Ctrl/Cmd+Shift+X, à la touche physique, et le raccourci de Tiptap est retiré", () => {
    for (const mac of [true, false]) {
      const strike = formatShortcuts(mac).filter((shortcut) => shortcut.code === "KeyX");
      expect(strike).toEqual([expect.objectContaining({ code: "KeyX", mod: true, shift: true })]);
      expect(strike[0]?.alt).toBeFalsy();
    }
    const target = start();
    target.commands.selectAll();
    const event = new KeyboardEvent("keydown", { key: "S", ctrlKey: true, shiftKey: true });
    target.view.someProp("handleKeyDown", (handler) => handler(target.view, event));
    expect(marksOf(target, "pain")).toEqual([]);
  });

  it("critère 3 : il se cumule avec le gras, l'italique, la couleur et le surlignage", () => {
    const target = start(
      docOf(
        textNode(
          "pain",
          "bold",
          "italic",
          { type: "textStyle", attrs: { color: "#C62828" } },
          { type: "highlight", attrs: { color: "#FFF176" } },
        ),
      ),
    );
    target.commands.selectAll();
    target.commands.toggleStrike();
    expect(marksOf(target, "pain")).toEqual(["bold", "highlight", "italic", "strike", "textStyle"]);
  });

  it("critère 4 : gardé dans un copier-coller interne", () => {
    const source = start(docOf(textNode("Acheter "), textNode("du pain", "strike")));
    const { html } = copyAll(source);
    const target = createTestEditor();
    pasteHtml(target, html);
    expect(marksOf(target, "du pain")).toEqual(["strike"]);
    target.destroy();
  });

  it("critère 4 : gardé dans un collage depuis une autre application (<s>, <del>, <strike>, style)", () => {
    const target = start(docOf(textNode("")));
    pasteHtml(
      target,
      '<p><s>un</s> <del>deux</del> <strike>trois</strike> <span style="text-decoration: line-through">quatre</span> cinq</p>',
    );
    for (const word of ["un", "deux", "trois", "quatre"]) {
      expect(marksOf(target, word)).toEqual(["strike"]);
    }
    expect(marksOf(target, "cinq")).toEqual([]);
  });

  it("critère 4 : le HTML copié vers un e-mail porte <s>", () => {
    const source = start(docOf(textNode("du pain", "strike")));
    expect(copyAll(source).html).toMatch(/<s>du pain<\/s>/);
  });
});
