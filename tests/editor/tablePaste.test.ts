// @vitest-environment jsdom
// Tests du collage de tableaux (src/editor/tablePaste.ts, src/editor/clipboard.ts, T1.8) : tableaux
// venus de Word, Excel, Google Docs et d'une page web, cellules fusionnées et tableaux imbriqués,
// collage dans une cellule, copie vers un e-mail.
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import type { DocumentJson } from "../../src/core/types";
import { splitMergedCells } from "../../src/editor/tablePaste";
import { copyAll, createTestEditor, pasteHtml } from "./editorHelpers";
import { BUDGET, cursorIn, nestedTables, tables } from "./tableHelpers";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function start(content?: DocumentJson): Editor {
  editor = createTestEditor(content);
  return editor;
}

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

  it("critère 4 : un tableau collé dans une cellule devient du texte, sans écraser les cellules voisines", () => {
    const target = start(BUDGET);
    cursorIn(target, "Courses");
    pasteHtml(target, "<table><tr><td>X</td><td>Y</td><td>Z</td></tr></table>");
    target.state.doc.check();
    expect(nestedTables(target.state.doc)).toBe(0);
    const [budget] = tables(target);
    expect(tables(target)).toHaveLength(1);
    expect(budget?.map((row) => row.length)).toEqual([2, 2, 2]);
    expect(budget?.[0]).toEqual(["Poste", "Montant"]);
    expect(budget?.[1]?.[0]).toMatch(/X.*Y.*Z/);
    expect(budget?.[1]?.[1]).toBe("350 €");
    expect(budget?.[2]).toEqual(["Électricité ⚡", "80 €"]);
  });

  it("critère 4 : un collage mixte (texte et tableau) dans une cellule ne coupe pas le tableau", () => {
    const target = start(BUDGET);
    cursorIn(target, "Courses");
    pasteHtml(target, "<p>avant</p><table><tr><td>X</td><td>Y</td></tr></table><p>après</p>");
    target.state.doc.check();
    expect(tables(target)).toHaveLength(1);
    const [budget] = tables(target);
    expect(budget?.map((row) => row.length)).toEqual([2, 2, 2]);
    expect(budget?.[1]?.[0]).toMatch(/avant.*X.*Y.*après/);
    expect(budget?.[2]).toEqual(["Électricité ⚡", "80 €"]);
  });

  it("critère 7 : un tableau de mise en page imbriqué dans un tableau web garde le tableau extérieur entier", () => {
    const target = start();
    pasteHtml(
      target,
      "<table><tr><td>A<table><tr><td>in1</td><td>in2</td></tr></table></td><td>B</td></tr></table>",
    );
    target.state.doc.check();
    expect(tables(target)).toHaveLength(1);
    const [row] = tables(target)[0] ?? [];
    expect(row).toHaveLength(2);
    expect(row?.[0]).toMatch(/A.*in1.*in2/);
    expect(row?.[1]).toBe("B");
  });

  it("critère 8 : un tableau copié depuis Nano Buro donne un vrai tableau HTML, lisible par un e-mail", () => {
    const target = start(BUDGET);
    const { html, text } = copyAll(target);
    expect(html).toMatch(/<table[^>]*>/);
    expect(html).toMatch(/<th[^>]*>.*Poste/);
    expect(html).toMatch(/<td[^>]*>.*350 €/);
    // Bordures en style, car un e-mail ne lit pas la feuille de style de l'application.
    expect(html).toMatch(/<td[^>]*style="[^"]*border: 1px solid/);
    expect(text).toContain("Courses");
  });
});
