// @vitest-environment jsdom
// Tests des majuscules et minuscules dans l'éditeur (src/editor/textCase.ts, T2.4) : lettres
// changées, mise en forme gardée lettre par lettre, sélection gardée, sans effet sans sélection.
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import type { DocumentJson } from "../../src/core/types";
import { changeCase } from "../../src/editor/textCase";
import { createTestEditor, docOf, textNode } from "./editorHelpers";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function start(content: DocumentJson): Editor {
  editor = createTestEditor(content);
  return editor;
}

/** Sélectionne `fragment` dans le texte du document (un seul paragraphe). */
function select(target: Editor, fragment: string): void {
  const from = target.state.doc.textContent.indexOf(fragment) + 1;
  target.commands.setTextSelection({ from, to: from + fragment.length });
}

/** Morceaux de texte du premier paragraphe et leurs marques. */
function runs(target: Editor): [string, string[]][] {
  const result: [string, string[]][] = [];
  target.state.doc.firstChild?.forEach((child) => {
    result.push([child.text ?? "", child.marks.map((mark) => mark.type.name)]);
  });
  return result;
}

describe("T2.4 : majuscules et minuscules dans l'éditeur", () => {
  it("critère 2 : change les lettres de la sélection seulement", () => {
    const target = start(docOf(textNode("le chœur de l'église")));
    select(target, "chœur");
    expect(changeCase(target, "upper")).toBe(true);
    expect(target.state.doc.textContent).toBe("le CHŒUR de l'église");
  });

  it("critère 2 : sans sélection, rien ne change", () => {
    const target = start(docOf(textNode("texte")));
    target.commands.setTextSelection(3);
    expect(changeCase(target, "upper")).toBe(false);
    expect(target.state.doc.textContent).toBe("texte");
  });

  it("critère 4 : la mise en forme est gardée lettre par lettre, et la sélection reste la même", () => {
    const target = start(
      docOf(
        textNode("BON", "bold"),
        textNode("JOUR ", { type: "textStyle", attrs: { color: "#C62828" } }),
        textNode("À TOUS", "italic", "strike"),
      ),
    );
    target.commands.selectAll();
    const before = target.state.selection;
    changeCase(target, "sentence");
    expect(runs(target)).toEqual([
      ["Bon", ["bold"]],
      ["jour ", ["textStyle"]],
      ["à tous", ["italic", "strike"]],
    ]);
    expect([target.state.selection.from, target.state.selection.to]).toEqual([
      before.from,
      before.to,
    ]);
  });

  it("critère 4 : une sélection partielle garde ses bords, même si le texte s'allonge (ß)", () => {
    const target = start(docOf(textNode("la straße ici")));
    select(target, "straße");
    changeCase(target, "upper");
    expect(target.state.doc.textContent).toBe("la STRASSE ici");
    const { from, to } = target.state.selection;
    expect(target.state.doc.textBetween(from, to)).toBe("STRASSE");
  });

  it("critère 6 : sur plusieurs paragraphes, chaque paragraphe commence une phrase", () => {
    const target = start({
      type: "doc",
      content: [
        { type: "paragraph", attrs: { id: "p-1" }, content: [textNode("PREMIER. SECOND")] },
        { type: "heading", attrs: { id: "h-1", level: 2 }, content: [textNode("TITRE")] },
      ],
    });
    target.commands.selectAll();
    changeCase(target, "sentence");
    expect(target.getText({ blockSeparator: "|" })).toBe("Premier. Second|Titre");
  });

  it("critère 5 : une seule transaction", () => {
    const target = start(docOf(textNode("UN "), textNode("DEUX", "bold"), textNode(" TROIS")));
    target.commands.selectAll();
    let transactions = 0;
    target.on("transaction", () => (transactions += 1));
    changeCase(target, "lower");
    expect(transactions).toBe(1);
  });
});
