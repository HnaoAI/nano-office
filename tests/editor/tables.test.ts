// @vitest-environment jsdom
// Tests des tableaux (src/core/tableSchema.ts, src/editor/tables.ts, src/editor/tablePaste.ts, T1.8) :
// schéma, insertion, identifiants des cellules, collage de tableaux venus de Word, Excel, Google Docs
// et d'une page web, copie vers un e-mail.
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { documentSchema } from "../../src/core/schema";
import type { DocumentJson } from "../../src/core/types";
import { headerRowActive, insertTable, isInTable } from "../../src/editor/tables";
import { splitMergedCells } from "../../src/editor/tablePaste";
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

const cell = (type: "tableCell" | "tableHeader", id: string, text: string): DocumentJson => ({
  type,
  attrs: { id },
  content: [
    {
      type: "paragraph",
      attrs: { id: `${id}-p` },
      ...(text ? { content: [{ type: "text", text }] } : {}),
    },
  ],
});

/** Tableau de budget : une ligne d'en-tête et deux lignes. */
const BUDGET: DocumentJson = {
  type: "doc",
  content: [
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [cell("tableHeader", "h-1", "Poste"), cell("tableHeader", "h-2", "Montant")],
        },
        {
          type: "tableRow",
          content: [cell("tableCell", "c-1", "Courses"), cell("tableCell", "c-2", "350 €")],
        },
        {
          type: "tableRow",
          content: [cell("tableCell", "c-3", "Électricité ⚡"), cell("tableCell", "c-4", "80 €")],
        },
      ],
    },
    { type: "paragraph", attrs: { id: "p-after" } },
  ],
};

/** Toutes les tables du document, chacune en lignes de textes de cellules. */
function tables(target: Editor): string[][][] {
  const result: string[][][] = [];
  target.state.doc.descendants((node) => {
    if (node.type.name !== "table") return true;
    const rows: string[][] = [];
    node.forEach((row) => {
      const cells: string[] = [];
      row.forEach((c) => cells.push(c.textContent));
      rows.push(cells);
    });
    result.push(rows);
    return false;
  });
  return result;
}

/** Nombre de tableaux contenus dans un autre tableau. */
function nestedTables(doc: ProseMirrorNode): number {
  let nested = 0;
  doc.descendants((node, _pos, parent) => {
    if (node.type.name === "table" && parent?.type.name !== "doc") nested++;
    return true;
  });
  return nested;
}

function cellIds(target: Editor): unknown[] {
  const ids: unknown[] = [];
  target.state.doc.descendants((node) => {
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") ids.push(node.attrs.id);
    return true;
  });
  return ids;
}

/** Place le curseur dans le texte `text`. */
function cursorIn(target: Editor, text: string): void {
  let found = -1;
  target.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(text)) found = pos + 1;
    return found < 0;
  });
  if (found < 0) throw new Error(`texte absent : ${text}`);
  target.commands.setTextSelection(found);
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

describe("T1.8 : collage", () => {
  const WORD_TABLE = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><!--StartFragment-->
    <table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0 style="border-collapse:collapse;border:none">
      <tr><td width=200 valign=top style="width:150pt;background:#FFC000;border:solid windowtext 1.0pt"><p class=MsoNormal><b><span style="font-family:Calibri;color:red">Mois</span></b></p></td>
      <td width=200 style="width:150pt;border:solid windowtext 1.0pt"><p class=MsoNormal><span style="font-family:Calibri">Budget</span></p></td></tr>
      <tr><td style="text-align:center"><p class=MsoNormal align=center style="text-align:center"><span style="font-size:20pt">Janvier</span></p></td>
      <td><p class=MsoNormal>1 200 €</p></td></tr>
    </table><!--EndFragment--></body></html>`;

  it("critère 7 : un tableau collé depuis Word reste un tableau, sans ses couleurs ni ses polices", () => {
    const target = start();
    pasteHtml(target, WORD_TABLE);
    expect(tables(target)).toEqual([
      [
        ["Mois", "Budget"],
        ["Janvier", "1 200 €"],
      ],
    ]);
    const json = JSON.stringify(target.getJSON());
    expect(json).not.toMatch(/Calibri|FFC000|red|20pt|textStyle|center|colwidth":\[/);
    expect(json).toContain('"bold"');
  });

  it("critère 7 : un tableau collé depuis Excel reste un tableau, ses cellules en paragraphes", () => {
    const EXCEL = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><body><table border=0 cellpadding=0 cellspacing=0 width=256>
      <col width=128 span=2><tr height=20><td height=20 class=xl65 width=128>Article</td><td class=xl65 width=128>Prix</td></tr>
      <tr><td style="color:#9C0006;background:#FFC7CE">Pain</td><td align=right x:num>1,2</td></tr></table></body></html>`;
    const target = start();
    pasteHtml(target, EXCEL);
    expect(tables(target)).toEqual([
      [
        ["Article", "Prix"],
        ["Pain", "1,2"],
      ],
    ]);
    expect(JSON.stringify(target.getJSON())).not.toMatch(/9C0006|FFC7CE|colwidth":\[|right/);
    target.state.doc.check();
  });

  it("critère 7 : un tableau collé depuis Google Docs ou une page web reste un tableau", () => {
    const GOOGLE_DOCS = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><div dir="ltr"><table style="border:none;border-collapse:collapse;"><colgroup><col width="301"><col width="301"></colgroup><tbody><tr><td style="border-left:solid #000000 1pt;background-color:#fce5cd;padding:5pt"><p dir="ltr"><span style="font-size:11pt;font-family:Arial;color:#ff0000;">Jour</span></p></td><td><p dir="ltr"><span>Repas</span></p></td></tr></tbody></table></div></b>`;
    const WEB = `<table><thead><tr><th style="font-family: Georgia">Ville</th><th>Habitants</th></tr></thead><tbody><tr><td>Lyon</td><td><i>520 000</i></td></tr></tbody></table>`;
    const fromDocs = start();
    pasteHtml(fromDocs, GOOGLE_DOCS);
    expect(tables(fromDocs)).toEqual([[["Jour", "Repas"]]]);
    expect(JSON.stringify(fromDocs.getJSON())).not.toMatch(/Arial|ff0000|fce5cd|colwidth":\[/);
    fromDocs.destroy();
    const fromWeb = start();
    pasteHtml(fromWeb, WEB);
    expect(tables(fromWeb)).toEqual([
      [
        ["Ville", "Habitants"],
        ["Lyon", "520 000"],
      ],
    ]);
    expect(JSON.stringify(fromWeb.getJSON())).not.toMatch(/Georgia/);
  });

  it("critère 7 : les cellules fusionnées collées sont séparées", () => {
    const MERGED = `<table>
      <tr><td colspan="2">Titre sur deux colonnes</td><td rowspan="2">Haut</td></tr>
      <tr><td>A</td><td>B</td></tr>
      <tr><td rowspan="2" colspan="2">Bloc</td><td>C</td></tr>
      <tr><td>D</td></tr></table>`;
    const target = start();
    pasteHtml(target, MERGED);
    expect(tables(target)).toEqual([
      [
        ["Titre sur deux colonnes", "", "Haut"],
        ["A", "B", ""],
        ["Bloc", "", "C"],
        ["", "", "D"],
      ],
    ]);
    target.state.doc.descendants((node) => {
      if (node.type.name === "tableCell") {
        expect(node.attrs.colspan).toBe(1);
        expect(node.attrs.rowspan).toBe(1);
      }
      return true;
    });
  });

  it("splitMergedCells sépare les cellules dans le HTML, en gardant le type d'en-tête", () => {
    const doc = new DOMParser().parseFromString(
      "<table><tr><th colspan=3>Entête</th></tr><tr><td>1</td><td>2</td><td>3</td></tr></table>",
      "text/html",
    );
    splitMergedCells(doc.body);
    expect(doc.body.querySelectorAll("th")).toHaveLength(3);
    expect(doc.body.querySelector("[colspan], [rowspan]")).toBeNull();
  });

  it("critère 4 : un tableau collé dans une cellule n'y crée pas de tableau imbriqué", () => {
    const target = start(BUDGET);
    cursorIn(target, "Courses");
    pasteHtml(target, "<p>avant</p><table><tr><td>X</td><td>Y</td></tr></table><p>après</p>");
    target.state.doc.check();
    expect(nestedTables(target.state.doc)).toBe(0);
  });

  it("critère 8 : un tableau copié depuis Nano Buro donne un vrai tableau HTML, lisible par un e-mail", () => {
    const target = start(BUDGET);
    const { html, text } = copyAll(target);
    expect(html).toMatch(/<table[^>]*>/);
    expect(html).toMatch(/<th[^>]*>.*Poste/);
    expect(html).toMatch(/<td[^>]*>.*350 €/);
    expect(text).toContain("Courses");
  });
});
