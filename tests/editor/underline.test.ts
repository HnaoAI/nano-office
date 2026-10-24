// @vitest-environment jsdom
// Tests du souligné (T2.10) dans jsdom : marque du schéma, raccourci à la touche physique, cumul avec les
// autres mises en forme, copier-coller interne et extérieur, HTML copié vers un e-mail, annulation.
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import { documentSchema } from "../../src/core/schema";
import { formatShortcuts, matchesShortcut } from "../../src/editor/keyboardShortcuts";
import { copyAll, createTestEditor, docOf, pasteHtml, textNode } from "./editorHelpers";
import { marksOf } from "./markHelpers";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function start(content = docOf(textNode("Acheter du pain"))): Editor {
  editor = createTestEditor(content);
  return editor;
}

describe("T2.10 : souligné", () => {
  it("critère 5 : le schéma du document connaît la marque « underline »", () => {
    expect(documentSchema.marks.underline).toBeDefined();
  });

  it("critère 2 : le raccourci est Ctrl/Cmd+U, à la touche physique (KeyU), sans Shift ni Alt", () => {
    for (const mac of [true, false]) {
      const underline = formatShortcuts(mac).filter((shortcut) => shortcut.code === "KeyU");
      expect(underline).toEqual([expect.objectContaining({ code: "KeyU", mod: true })]);
      expect(underline[0]?.shift).toBeFalsy();
      expect(underline[0]?.alt).toBeFalsy();
      const shortcut = underline[0];
      if (!shortcut) throw new Error("raccourci absent");
      const event = new KeyboardEvent("keydown", {
        code: "KeyU",
        key: "ù",
        metaKey: mac,
        ctrlKey: !mac,
      });
      expect(matchesShortcut(event, shortcut, mac)).toBe(true);
    }
  });

  it("critère 2 : le raccourci de Tiptap, reconnu au caractère produit, est retiré", () => {
    const target = start();
    target.commands.selectAll();
    const event = new KeyboardEvent("keydown", { key: "u", code: "KeyY", ctrlKey: true });
    target.view.someProp("handleKeyDown", (handler) => handler(target.view, event));
    expect(marksOf(target, "pain")).toEqual([]);
  });

  it("critère 3 : il se cumule avec le gras, l'italique, le barré, la couleur et le surlignage", () => {
    const target = start(
      docOf(
        textNode(
          "pain",
          "bold",
          "italic",
          "strike",
          { type: "textStyle", attrs: { color: "#C62828" } },
          { type: "highlight", attrs: { color: "#FFF176" } },
        ),
      ),
    );
    target.commands.selectAll();
    target.commands.toggleUnderline();
    expect(marksOf(target, "pain")).toEqual([
      "bold",
      "highlight",
      "italic",
      "strike",
      "textStyle",
      "underline",
    ]);
  });

  it("critère 3 : gardé dans un copier-coller interne", () => {
    const source = start(docOf(textNode("Acheter "), textNode("du pain", "underline")));
    const { html } = copyAll(source);
    const target = createTestEditor();
    pasteHtml(target, html);
    expect(marksOf(target, "du pain")).toEqual(["underline"]);
    target.destroy();
  });

  it("critère 3 : gardé dans un collage depuis une autre application (<u>, style), comme le gras", () => {
    const target = start(docOf(textNode("")));
    pasteHtml(
      target,
      '<p><u>un</u> <span style="text-decoration: underline">deux</span> <b>trois</b> quatre</p>',
    );
    expect(marksOf(target, "un")).toEqual(["underline"]);
    expect(marksOf(target, "deux")).toEqual(["underline"]);
    expect(marksOf(target, "trois")).toEqual(["bold"]);
    expect(marksOf(target, "quatre")).toEqual([]);
  });

  it("critère 3 : le HTML copié vers un e-mail porte <u>", () => {
    const source = start(docOf(textNode("du pain", "underline")));
    expect(copyAll(source).html).toMatch(/<u>du pain<\/u>/);
  });

  it("critère 3 : texte vide, accents et emojis soulignés", () => {
    const target = start(docOf(textNode("Élève 🎒 à l'école")));
    target.commands.selectAll();
    target.commands.toggleUnderline();
    expect(marksOf(target, "Élève 🎒 à l'école")).toEqual(["underline"]);
    const empty = createTestEditor();
    empty.commands.selectAll();
    expect(() => empty.commands.toggleUnderline()).not.toThrow();
    expect(empty.getText()).toBe("");
    empty.destroy();
  });

  it("critère 4 : le tableau des raccourcis de l'aide le cite", () => {
    expect(formatShortcuts(false).map((shortcut) => shortcut.label)).toContain("Souligné");
  });
});
