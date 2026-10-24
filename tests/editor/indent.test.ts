// @vitest-environment jsdom
// Tests du retrait de paragraphe (T2.14) dans jsdom : attribut de bloc, 5 niveaux, listes, Tab inchangé,
// collage interne et extérieur, une seule transaction.
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import { documentSchema } from "../../src/core/schema";
import { INDENT_STEP_CM, MAX_INDENT } from "../../src/core/indent";
import type { DocumentJson } from "../../src/core/types";
import { changeIndent, indentAvailability } from "../../src/editor/indent";
import { FormatShortcuts } from "../../src/editor/keyboardShortcuts";
import { copyAll, createTestEditor, pasteHtml } from "./editorHelpers";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function para(text: string, attrs: Record<string, unknown> = {}): DocumentJson {
  return { type: "paragraph", attrs: { id: null, ...attrs }, content: [{ type: "text", text }] };
}

function start(...content: DocumentJson[]): Editor {
  editor = createTestEditor({ type: "doc", content }, [FormatShortcuts]);
  return editor;
}

function indents(target: Editor): unknown[] {
  return (target.getJSON().content ?? []).map((block) => block.attrs?.indent ?? null);
}

describe("T2.14 : retrait de paragraphe", () => {
  it("critère 3 : le retrait est un attribut de bloc des paragraphes et des titres", () => {
    expect(documentSchema.nodes.paragraph?.spec.attrs?.indent).toBeDefined();
    expect(documentSchema.nodes.heading?.spec.attrs?.indent).toBeDefined();
  });

  it("critère 1 : « Augmenter le retrait » décale le paragraphe de 1,25 cm, jusqu'à 5 niveaux", () => {
    const target = start(para("Citation"));
    for (let step = 1; step <= MAX_INDENT; step++) {
      expect(changeIndent(target, 1)).toBe(true);
      expect(indents(target)).toEqual([step]);
    }
    expect(changeIndent(target, 1)).toBe(false);
    expect(indents(target)).toEqual([MAX_INDENT]);
    expect(indentAvailability(target.state)).toEqual({ increase: false, decrease: true });
    expect(target.view.dom.querySelector("p")?.getAttribute("style")).toContain(
      `margin-left: ${String(MAX_INDENT * INDENT_STEP_CM)}cm`,
    );
  });

  it("critère 1 : « Diminuer le retrait » ramène vers la gauche, et sans retrait l'attribut disparaît", () => {
    const target = start(para("Citation", { indent: 2 }));
    changeIndent(target, -1);
    expect(indents(target)).toEqual([1]);
    changeIndent(target, -1);
    expect(indents(target)).toEqual([null]);
    expect(changeIndent(target, -1)).toBe(false);
    expect(indentAvailability(target.state)).toEqual({ increase: true, decrease: false });
  });

  it("critère 1 : un titre se décale aussi, et tous les blocs sélectionnés ensemble", () => {
    const target = start(
      {
        type: "heading",
        attrs: { id: null, level: 2 },
        content: [{ type: "text", text: "Titre" }],
      },
      para("Un", { indent: 1 }),
      para("Deux"),
    );
    target.commands.selectAll();
    changeIndent(target, 1);
    expect(indents(target)).toEqual([1, 2, 1]);
  });

  it("critère 1 : dans une liste, les boutons décalent l'élément comme Tab et Shift+Tab", () => {
    const target = start({
      type: "bulletList",
      content: [
        { type: "listItem", attrs: { id: null }, content: [para("Un")] },
        { type: "listItem", attrs: { id: null }, content: [para("Deux")] },
      ],
    });
    target.commands.setTextSelection(target.state.doc.content.size - 3);
    changeIndent(target, 1);
    const json = target.getJSON() as DocumentJson;
    const nested = json.content?.[0]?.content?.[0]?.content?.[1];
    expect(nested?.type).toBe("bulletList");
    changeIndent(target, -1);
    expect((target.getJSON() as DocumentJson).content?.[0]?.content).toHaveLength(2);
    expect(JSON.stringify(target.getJSON())).not.toContain('"indent":1');
  });

  it("critère 2 : Tab et Shift+Tab ne changent pas le retrait hors des listes", () => {
    const target = start(para("Texte", { indent: 1 }));
    for (const shiftKey of [false, true]) {
      const event = new KeyboardEvent("keydown", { key: "Tab", code: "Tab", shiftKey });
      target.view.someProp("handleKeyDown", (handler) => handler(target.view, event));
    }
    expect(indents(target)).toEqual([1]);
  });

  it("critère 3 : gardé dans un collage interne, retiré d'un collage extérieur", () => {
    const source = start(para("Citation", { indent: 3 }));
    const { html } = copyAll(source);
    const inside = createTestEditor();
    pasteHtml(inside, html);
    expect(indents(inside)).toEqual([3]);
    inside.destroy();

    const outside = createTestEditor();
    pasteHtml(outside, '<p data-indent="3" style="margin-left: 4cm">Citation</p>');
    expect(indents(outside)).toEqual([null]);
    outside.destroy();
  });

  it("critère 3 : une valeur hors bornes venue d'un fichier est ramenée à 5, une valeur invalide ignorée", () => {
    const target = start(para("Trop", { indent: 12 }), para("Faux", { indent: "abc" }));
    const styles = Array.from(target.view.dom.querySelectorAll("p")).map((p) =>
      p.getAttribute("style"),
    );
    expect(styles[0]).toContain("margin-left: 6.25cm");
    expect(styles[1] ?? "").not.toContain("margin-left");
  });

  it("critère 4 : un clic de bouton est une seule transaction", () => {
    const target = start(para("Un"), para("Deux"));
    target.commands.selectAll();
    let transactions = 0;
    target.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) transactions++;
    });
    changeIndent(target, 1);
    // La transaction du bouton, et éventuellement celle des identifiants qui la rejoint.
    expect(transactions).toBeGreaterThanOrEqual(1);
    expect(transactions).toBeLessThanOrEqual(2);
    expect(indents(target)).toEqual([1, 1]);
  });
});
