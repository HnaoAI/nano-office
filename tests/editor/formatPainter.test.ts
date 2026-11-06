// @vitest-environment jsdom
// Tests du pinceau dans l'éditeur (src/editor/formatPainter.ts, PL4) : allumer pour une fois ou jusqu'à Échap,
// application à la sélection en une transaction, mot cliqué, image ignorée, rien dans le document.
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import {
  FormatPainter,
  formatPainterActive,
  formatPainterSticky,
  paintSelection,
  startFormatPainter,
  stopFormatPainter,
} from "../../src/editor/formatPainter";
import { createTestEditor, textNode } from "./editorHelpers";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function start(): Editor {
  editor = createTestEditor(
    {
      type: "doc",
      content: [
        { type: "paragraph", attrs: { id: "p-1" }, content: [textNode("source", "bold")] },
        { type: "paragraph", attrs: { id: "p-2" }, content: [textNode("une cible ici")] },
        { type: "image", attrs: { id: "i-1", hash: "a".repeat(64) } },
      ],
    },
    [FormatPainter],
  );
  editor.commands.setTextSelection(3);
  return editor;
}

/** Position du début de `fragment` dans le document. */
function posOf(target: Editor, fragment: string): number {
  let found = -1;
  target.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(fragment)) {
      found = pos + node.text.indexOf(fragment);
    }
    return found < 0;
  });
  return found;
}

function boldText(target: Editor): string {
  let text = "";
  target.state.doc.descendants((node) => {
    if (node.isText && node.marks.some((mark) => mark.type.name === "bold"))
      text += node.text ?? "";
    return true;
  });
  return text;
}

describe("PL4 : pinceau dans l'éditeur", () => {
  it("critère 6 : un clic sert une fois, puis le pinceau s'éteint", () => {
    const target = start();
    expect(startFormatPainter(target, false)).toBe(true);
    expect(formatPainterActive(target.state)).toBe(true);
    const from = posOf(target, "cible");
    target.commands.setTextSelection({ from, to: from + 5 });
    expect(paintSelection(target.view)).toBe(true);
    expect(boldText(target)).toBe("sourcecible");
    expect(formatPainterActive(target.state)).toBe(false);
  });

  it("critère 6 : un double clic le garde actif jusqu'à Échap", () => {
    const target = start();
    startFormatPainter(target, true);
    expect(formatPainterSticky(target.state)).toBe(true);
    target.commands.setTextSelection(posOf(target, "une") + 1);
    paintSelection(target.view);
    target.commands.setTextSelection(posOf(target, "ici") + 1);
    paintSelection(target.view);
    expect(boldText(target)).toBe("sourceuneici");
    expect(formatPainterActive(target.state)).toBe(true);
    const escape = new KeyboardEvent("keydown", { key: "Escape" });
    target.view.someProp("handleKeyDown", (handler) => handler(target.view, escape));
    expect(formatPainterActive(target.state)).toBe(false);
  });

  it("critère 7 : une application est une seule transaction", () => {
    const target = start();
    startFormatPainter(target, false);
    const from = posOf(target, "cible");
    target.commands.setTextSelection({ from, to: from + 5 });
    let count = 0;
    target.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) count++;
    });
    paintSelection(target.view);
    expect(count).toBe(1);
  });

  it("critère 8 : sur une image choisie d'un clic, rien ne change et le pinceau reste actif", () => {
    const target = start();
    startFormatPainter(target, false);
    const before = target.state.doc.toJSON() as unknown;
    const imagePos = target.state.doc.content.size - (target.state.doc.lastChild?.nodeSize ?? 0);
    target.view.dispatch(
      target.state.tr.setSelection(NodeSelection.create(target.state.doc, imagePos)),
    );
    expect(paintSelection(target.view)).toBe(false);
    expect(target.state.doc.toJSON()).toEqual(before);
    expect(formatPainterActive(target.state)).toBe(true);
  });

  it("critère 10 : allumer et éteindre le pinceau ne change pas le document", () => {
    const target = start();
    const before = target.state.doc.toJSON() as unknown;
    startFormatPainter(target, true);
    stopFormatPainter(target.view);
    expect(target.state.doc.toJSON()).toEqual(before);
    expect(target.view.dom.classList.contains("nano-format-painting")).toBe(false);
  });

  it("critère 9 : la classe du pointeur est posée tant que le pinceau est actif", () => {
    const target = start();
    startFormatPainter(target, false);
    expect(target.view.dom.classList.contains("nano-format-painting")).toBe(true);
  });
});
