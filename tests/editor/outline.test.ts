// @vitest-environment jsdom
// Plan du document dans l'éditeur (T2.9) : déplacement d'une partie relié au Y.Doc, en une étape
// d'annulation, avec ses identifiants, au clavier, et aller à un titre sans modifier le document.
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import * as Y from "yjs";
import { documentOutline } from "../../src/core/outline";
import type { DocumentJson } from "../../src/core/types";
import { createEditorOptions } from "../../src/editor/editorOptions";
import {
  canDropSection,
  goToHeading,
  headingAtCursor,
  moveSectionBefore,
  moveSectionStep,
} from "../../src/editor/outline";
import { jsonFromYdoc, ydocFromJson } from "../core/helpers";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function text(value: string): DocumentJson {
  return { type: "text", text: value };
}

function para(id: string): DocumentJson {
  return { type: "paragraph", attrs: { id }, content: [text(`Texte ${id}`)] };
}

function heading(id: string, level: number): DocumentJson {
  return { type: "heading", attrs: { id, level }, content: [text(`Titre ${id}`)] };
}

function table(id: string): DocumentJson {
  return {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [0, 1].map((col) => ({
          type: "tableCell",
          attrs: { id: `${id}-c-${col}` },
          content: [para(`${id}-p-${col}`)],
        })),
      },
    ],
  };
}

const EXPOSE: DocumentJson[] = [
  heading("a", 1),
  para("a-1"),
  heading("b", 1),
  para("b-1"),
  table("t"),
  heading("b-sub", 2),
  para("b-2"),
  heading("c", 1),
  para("c-1"),
];

/** Éditeur relié à un Y.Doc, comme dans l'application. */
function create(content: DocumentJson[]): { editor: Editor; ydoc: Y.Doc } {
  const ydoc = ydocFromJson({ type: "doc", content });
  editor = new Editor({ element: document.createElement("div"), ...createEditorOptions(ydoc) });
  return { editor, ydoc };
}

function ids(doc: ProseMirrorNode): string[] {
  const out: string[] = [];
  doc.forEach((node) => out.push((node.attrs.id as string | undefined) ?? node.type.name));
  return out;
}

function yIds(ydoc: Y.Doc): string[] {
  return (jsonFromYdoc(ydoc).content ?? []).map(
    (node) => (node.attrs?.id as string | undefined) ?? node.type,
  );
}

function entry(id: string) {
  return { id, index: -1 };
}

function undo(target: Editor) {
  target.commands.undo();
}

describe("T2.9 : plan dans l'éditeur", () => {
  it("critère 4 : glisser la troisième partie en premier déplace tout, dans le Y.Doc aussi", () => {
    const { editor: current, ydoc } = create(EXPOSE);
    expect(moveSectionBefore(current, entry("c"), entry("a"))).toBe(true);
    const expected = ["c", "c-1", "a", "a-1", "b", "b-1", "table", "b-sub", "b-2"];
    expect(ids(current.state.doc)).toEqual(expected);
    expect(yIds(ydoc)).toEqual(expected);
    // Le curseur est au début du titre déplacé.
    expect(current.state.selection.$from.parent.attrs.id).toBe("c");
  });

  it("critère 5 : un seul Ctrl/Cmd+Z remet tout en place", () => {
    const { editor: current, ydoc } = create(EXPOSE);
    current.commands.insertContentAt(current.state.doc.content.size - 1, " ajouté");
    const before = jsonFromYdoc(ydoc);
    moveSectionBefore(current, entry("b"), null);
    expect(ids(current.state.doc).slice(-5)).toEqual(["b", "b-1", "table", "b-sub", "b-2"]);
    undo(current);
    expect(jsonFromYdoc(ydoc)).toEqual(before);
    // La frappe d'avant n'est pas annulée avec le déplacement.
    expect(current.state.doc.textContent).toContain("ajouté");
  });

  it("critère 6 : les identifiants des blocs et des cellules sont gardés, rien n'est dupliqué", () => {
    const { editor: current } = create(EXPOSE);
    const all = (doc: ProseMirrorNode) => {
      const out: string[] = [];
      doc.descendants((node) => {
        if (typeof node.attrs.id === "string") out.push(node.attrs.id);
      });
      return out.sort();
    };
    const before = all(current.state.doc);
    moveSectionBefore(current, entry("b"), entry("a"));
    expect(all(current.state.doc)).toEqual(before);
    undo(current);
    expect(all(current.state.doc)).toEqual(before);
  });

  it("critère 4 : poser une partie dans elle-même est refusé", () => {
    const { editor: current } = create(EXPOSE);
    expect(canDropSection(current, entry("b"), entry("b-sub"))).toBe(false);
    expect(canDropSection(current, entry("b"), entry("c"))).toBe(false);
    expect(canDropSection(current, entry("b"), entry("a"))).toBe(true);
    expect(canDropSection(current, entry("b"), null)).toBe(true);
    const before = current.state.doc;
    expect(moveSectionBefore(current, entry("b"), entry("b-sub"))).toBe(false);
    expect(current.state.doc.eq(before)).toBe(true);
  });

  it("critère 4 : au clavier, la partie passe avant la précédente puis après la suivante", () => {
    const { editor: current } = create(EXPOSE);
    expect(moveSectionStep(current, entry("c"), "up")).toBe(true);
    expect(ids(current.state.doc)).toEqual([
      "a",
      "a-1",
      "c",
      "c-1",
      "b",
      "b-1",
      "table",
      "b-sub",
      "b-2",
    ]);
    expect(moveSectionStep(current, entry("c"), "down")).toBe(true);
    expect(ids(current.state.doc).slice(-2)).toEqual(["c", "c-1"]);
    expect(moveSectionStep(current, entry("c"), "down")).toBe(false);
    expect(moveSectionStep(current, entry("b-sub"), "up")).toBe(false);
  });

  it("critère 3 : aller à un titre place le curseur à son début, sans modifier le document", () => {
    const { editor: current, ydoc } = create(EXPOSE);
    const before = jsonFromYdoc(ydoc);
    expect(goToHeading(current, entry("b-sub"), () => 0)).toBe(true);
    const { $from } = current.state.selection;
    expect($from.parent.attrs.id).toBe("b-sub");
    expect($from.parentOffset).toBe(0);
    expect(headingAtCursor(current)).toMatchObject({ id: "b-sub" });
    expect(jsonFromYdoc(ydoc)).toEqual(before);
    expect(goToHeading(current, entry("absent"), () => 0)).toBe(false);
  });

  it("critère 8 : le plan n'écrit rien dans le document", () => {
    const { editor: current, ydoc } = create(EXPOSE);
    const before = jsonFromYdoc(ydoc);
    documentOutline(current.state.doc);
    expect(jsonFromYdoc(ydoc)).toEqual(before);
    expect(JSON.stringify(before)).not.toContain("outline");
  });
});
