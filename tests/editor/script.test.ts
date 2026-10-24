// @vitest-environment jsdom
// Tests de l'exposant et de l'indice (T2.13) dans jsdom : marques du schéma, exclusion mutuelle, raccourcis à la
// touche physique et au caractère produit (clavier AZERTY), copier-coller.
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import { documentSchema } from "../../src/core/schema";
import {
  FormatShortcuts,
  formatShortcuts,
  matchesShortcut,
} from "../../src/editor/keyboardShortcuts";
import { copyAll, createTestEditor, docOf, pasteHtml, textNode } from "./editorHelpers";
import { marksOf } from "./markHelpers";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function start(content = docOf(textNode("1er m2 H2O"))): Editor {
  editor = createTestEditor(content, [FormatShortcuts]);
  return editor;
}

/** Sélectionne `fragment` dans le premier paragraphe. */
function select(target: Editor, fragment: string) {
  const index = target.state.doc.textContent.indexOf(fragment);
  target.commands.setTextSelection({ from: index + 1, to: index + 1 + fragment.length });
}

function shortcut(label: string, mac: boolean) {
  const found = formatShortcuts(mac).find((candidate) => candidate.label === label);
  if (!found) throw new Error(`raccourci absent : ${label}`);
  return found;
}

function press(target: Editor, init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", init);
  target.view.someProp("handleKeyDown", (handler) => handler(target.view, event));
}

describe("T2.13 : exposant et indice", () => {
  it("critère 5 : le schéma connaît les marques « superscript » et « subscript »", () => {
    expect(documentSchema.marks.superscript).toBeDefined();
    expect(documentSchema.marks.subscript).toBeDefined();
  });

  it("critère 3 : exposant et indice s'excluent, choisir l'un retire l'autre", () => {
    const target = start();
    select(target, "er");
    target.commands.toggleSuperscript();
    expect(marksOf(target, "er")).toEqual(["superscript"]);
    target.commands.toggleSubscript();
    expect(marksOf(target, "er")).toEqual(["subscript"]);
    target.commands.toggleSuperscript();
    expect(marksOf(target, "er")).toEqual(["superscript"]);
  });

  it("critère 2 : Ctrl/Cmd+. met en exposant et Ctrl/Cmd+, en indice, à la touche physique (QWERTY)", () => {
    for (const mac of [true, false]) {
      const mods = { metaKey: mac, ctrlKey: !mac };
      expect(
        matchesShortcut(
          new KeyboardEvent("keydown", { code: "Period", key: ".", ...mods }),
          shortcut("Exposant", mac),
          mac,
        ),
      ).toBe(true);
      expect(
        matchesShortcut(
          new KeyboardEvent("keydown", { code: "Comma", key: ",", ...mods }),
          shortcut("Indice", mac),
          mac,
        ),
      ).toBe(true);
    }
    const target = start();
    select(target, "er");
    press(target, { code: "Period", key: ".", ctrlKey: true });
    expect(marksOf(target, "er")).toEqual(["superscript"]);
    select(target, "2O");
    press(target, { code: "Comma", key: ",", ctrlKey: true });
    expect(marksOf(target, "2O")).toEqual(["subscript"]);
  });

  it("critère 2 : sur un clavier AZERTY, Ctrl+Shift+; (le point) et Ctrl+, (touche M de QWERTY) fonctionnent", () => {
    const target = start();
    select(target, "er");
    // AZERTY : le point est Shift sur la touche « ; », dont la touche physique est Comma.
    press(target, { code: "Comma", key: ".", ctrlKey: true, shiftKey: true });
    expect(marksOf(target, "er")).toEqual(["superscript"]);
    select(target, "2O");
    // AZERTY : la virgule est sur la touche physique KeyM.
    press(target, { code: "KeyM", key: ",", ctrlKey: true });
    expect(marksOf(target, "2O")).toEqual(["subscript"]);
  });

  it("critère 2 : jamais avec AltGr (Ctrl+Alt), ni Ctrl+Shift+. sur un clavier QWERTY (« > »)", () => {
    const target = start();
    select(target, "er");
    press(target, { code: "Period", key: ".", ctrlKey: true, altKey: true });
    press(target, { code: "Period", key: ">", ctrlKey: true, shiftKey: true });
    expect(marksOf(target, "er")).toEqual([]);
  });

  it("critère 4 : gardés dans un copier-coller interne et depuis une autre application", () => {
    const source = start(
      docOf(
        textNode("m"),
        textNode("2", "superscript"),
        textNode(" H"),
        textNode("2", "subscript"),
        textNode("O"),
      ),
    );
    const { html } = copyAll(source);
    expect(html).toMatch(/<sup>2<\/sup>/);
    expect(html).toMatch(/<sub>2<\/sub>/);
    const target = createTestEditor();
    pasteHtml(target, html);
    const marks = target
      .getJSON()
      .content?.[0]?.content?.map((node) => node.marks?.[0]?.type ?? null);
    expect(marks).toEqual([null, "superscript", null, "subscript", null]);
    target.destroy();

    const outside = createTestEditor();
    pasteHtml(
      outside,
      '<p>1<sup>er</sup> CO<sub>2</sub> x<span style="vertical-align: super">3</span></p>',
    );
    expect(marksOf(outside, "er")).toEqual(["superscript"]);
    expect(marksOf(outside, "3")).toEqual(["superscript"]);
    outside.destroy();
  });
});
