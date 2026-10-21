// @vitest-environment jsdom
// Tests des tableaux (src/core/tableSchema.ts, src/editor/tables.ts, T1.8) : schéma, insertion,
// identifiants des cellules. Le collage est dans tablePaste.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import { documentSchema } from "../../src/core/schema";
import type { DocumentJson } from "../../src/core/types";
import { BUDGET, cell, cellIds, cursorIn, nestedTables, tables } from "./tableHelpers";
import { headerRowActive, insertTable, isInTable } from "../../src/editor/tables";
import { copyAll, createTestEditor, pasteHtml } from "./editorHelpers";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function start(content?: DocumentJson): Editor {
  editor = createTestEditor(content);
  return editor;
}

describe("T1.8 : schéma", () => {
  it("critère 4 : un tableau accepte du texte mis en forme et des listes dans ses cellules", () => {
    const node = documentSchema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { id: "c-1" },
                  content: [
                    {
                      type: "paragraph",
                      attrs: { textAlign: "center" },
                      content: [
                        {
                          type: "text",
                          text: "gras rouge",
                          marks: [
                            { type: "bold" },
                            { type: "italic" },
                            {
                              type: "textStyle",
                              attrs: {
                                color: "#C62828",
                                fontFamily: "EB Garamond",
                                fontSize: "14pt",
                              },
                            },
                          ],
                        },
                      ],
                    },
                    {
                      type: "bulletList",
                      content: [
                        {
                          type: "listItem",
                          content: [
                            { type: "paragraph", content: [{ type: "text", text: "lait" }] },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(() => node.check()).not.toThrow();
  });

  it("critère 4 : un tableau ne peut pas contenir un autre tableau, ni une liste un tableau", () => {
    const inner = {
      type: "table",
      content: [{ type: "tableRow", content: [cell("tableCell", "x", "x")] }],
    };
    const nestedInCell = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [{ type: "tableRow", content: [{ type: "tableCell", content: [inner] }] }],
        },
      ],
    };
    expect(() => documentSchema.nodeFromJSON(nestedInCell).check()).toThrow();
    const inList = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [{ type: "paragraph" }, inner] }],
        },
      ],
    };
    expect(() => documentSchema.nodeFromJSON(inList).check()).toThrow();
  });

  it("critère 9 : un document sans tableau reste valide avec le nouveau schéma", () => {
    const node = documentSchema.nodeFromJSON({
      type: "doc",
      content: [
        { type: "paragraph", attrs: { id: "p-1" }, content: [{ type: "text", text: "a" }] },
      ],
    });
    expect(() => node.check()).not.toThrow();
  });
});

describe("T1.8 : insertion", () => {
  it("critère 1 : insère un tableau du nombre de lignes et de colonnes choisi, avec une ligne d'en-tête", () => {
    const target = start();
    insertTable(target, 3, 4);
    const [table] = tables(target);
    expect(table).toHaveLength(3);
    expect(table?.every((row) => row.length === 4)).toBe(true);
    const types: string[] = [];
    target.state.doc.descendants((node) => {
      if (node.type.name === "tableRow") types.push(node.firstChild?.type.name ?? "");
      return true;
    });
    expect(types).toEqual(["tableHeader", "tableCell", "tableCell"]);
    expect(isInTable(target.state)).toBe(true);
    expect(headerRowActive(target.state)).toBe(true);
  });

  it("un paragraphe suit toujours le tableau inséré, pour pouvoir écrire après", () => {
    const target = start();
    insertTable(target, 2, 2);
    expect(target.state.doc.lastChild?.type.name).toBe("paragraph");
  });

  it("critère 4 : l'insertion est refusée dans un tableau", () => {
    const target = start(BUDGET);
    cursorIn(target, "Courses");
    expect(insertTable(target, 2, 2)).toBe(false);
    expect(tables(target)).toHaveLength(1);
    expect(nestedTables(target.state.doc)).toBe(0);
  });

  it("critère 4 : insérer un tableau dans une liste le place hors de la liste, sans tableau imbriqué", () => {
    const target = start({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              attrs: { id: "li-1" },
              content: [{ type: "paragraph", content: [{ type: "text", text: "élément" }] }],
            },
          ],
        },
      ],
    });
    cursorIn(target, "élément");
    insertTable(target, 2, 2);
    target.state.doc.check();
    expect(tables(target)).toHaveLength(1);
    target.state.doc.descendants((node, _pos, parent) => {
      if (node.type.name === "table") expect(parent?.type.name).toBe("doc");
      return true;
    });
    expect(target.state.doc.textContent).toContain("élément");
  });
});

describe("T1.8 : identifiants des cellules", () => {
  it("critère 6 : chaque cellule reçoit un identifiant unique à l'insertion", () => {
    const target = start();
    insertTable(target, 3, 3);
    const ids = cellIds(target);
    expect(ids).toHaveLength(9);
    for (const id of ids) expect(typeof id === "string" && id !== "").toBe(true);
    expect(new Set(ids).size).toBe(9);
  });

  it("critère 6 : les cellules existantes gardent leur identifiant quand on ajoute une ligne ou une colonne", () => {
    const target = start(BUDGET);
    cursorIn(target, "Courses");
    target.commands.addRowAfter();
    target.commands.addColumnBefore();
    target.commands.toggleHeaderRow();
    target.commands.toggleHeaderRow();
    const ids = cellIds(target);
    for (const id of ["h-1", "h-2", "c-1", "c-2", "c-3", "c-4"]) expect(ids).toContain(id);
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
  });

  it("critère 6 : un tableau collé depuis Nano Buro reçoit de nouveaux identifiants", () => {
    const target = start(BUDGET);
    const { html } = copyAll(target);
    target.commands.setTextSelection(target.state.doc.content.size - 1);
    pasteHtml(target, html);
    expect(tables(target)).toHaveLength(2);
    const ids = cellIds(target);
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
    expect(ids.slice(0, 6)).toEqual(["h-1", "h-2", "c-1", "c-2", "c-3", "c-4"]);
  });
});
