// @vitest-environment jsdom
// Tests du copier-coller propre (src/editor/clipboard.ts, T1.5) : extraits HTML typiques (page web,
// Word, Google Docs) collés dans un éditeur sans affichage, avec tout le chemin de collage de
// ProseMirror (`pasteHTML`, `pasteText`). jsdom fournit le DOM que Node n'a pas.
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { documentExtensions } from "../../src/core/schema";
import type { DocumentJson } from "../../src/core/types";
import { BlockIdGenerator } from "../../src/editor/blockIds";
import { CleanClipboard, isNanoBuroHtml } from "../../src/editor/clipboard";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

/** Éditeur avec le schéma du document, le générateur d'identifiants et le copier-coller propre. */
function createEditor(content?: DocumentJson): Editor {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: [...documentExtensions, BlockIdGenerator, CleanClipboard],
    enableInputRules: false,
    enablePasteRules: false,
    ...(content ? { content } : {}),
  });
  return editor;
}

/** Contenu de l'éditeur sans les identifiants, pour comparer la structure. */
function structure(target: Editor): DocumentJson[] {
  const strip = (node: DocumentJson): DocumentJson => {
    const attrs = Object.fromEntries(
      Object.entries(node.attrs ?? {}).filter(([key, value]) => key !== "id" && value !== null),
    );
    return {
      type: node.type,
      ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
      ...(node.text !== undefined ? { text: node.text } : {}),
      ...(node.marks ? { marks: node.marks } : {}),
      ...(node.content ? { content: node.content.map(strip) } : {}),
    };
  };
  return (target.getJSON() as DocumentJson).content?.map(strip) ?? [];
}

/** Tous les identifiants de bloc du document. */
function blockIds(target: Editor): unknown[] {
  const ids: unknown[] = [];
  target.state.doc.descendants((node) => {
    if ("id" in node.attrs) ids.push(node.attrs.id);
    return true;
  });
  return ids;
}

/** Colle du HTML par le chemin de collage de ProseMirror (jsdom n'a pas de ClipboardEvent). */
function pasteHtml(target: Editor, html: string): boolean {
  return target.view.pasteHTML(html, new Event("paste") as ClipboardEvent);
}

/** Colle du texte brut, comme Ctrl/Cmd+Shift+V. */
function pastePlainText(target: Editor, plain: string): boolean {
  return target.view.pasteText(plain, new Event("paste") as ClipboardEvent);
}

/** Ce que l'éditeur mettrait dans le presse-papiers pour tout son contenu. */
function copyAll(source: Editor): { html: string; text: string } {
  const { dom, text } = source.view.serializeForClipboard(source.state.doc.slice(0));
  return { html: dom.innerHTML, text };
}

const text = (value: string, marks?: string[]): DocumentJson => ({
  type: "text",
  text: value,
  ...(marks ? { marks: marks.map((type) => ({ type })) } : {}),
});
const p = (...content: DocumentJson[]): DocumentJson => ({ type: "paragraph", content });

describe("collage depuis une page web (T1.5)", () => {
  const WEB_PAGE = `
    <h1 style="font-family: Georgia; color: #c00; font-size: 40px">Les volcans</h1>
    <p style="font-family: 'Comic Sans MS'; font-size: 22px; background: yellow; text-align: center">
      Un <b>volcan</b> est une <i>montagne</i> qui crache <span style="color:red; font-family: Arial">du feu</span>.
    </p>
    <ul><li>Etna</li><li>Vésuve <strong>🌋</strong></li></ul>
    <img src="https://exemple.fr/volcan.jpg" alt="volcan">
    <script>alert("piège")</script><style>p { color: red }</style>
    <video src="film.mp4"></video>
    <table><tr><td>Hauteur</td><td>3 357 m</td></tr></table>`;

  it("critère 1 : garde paragraphes, gras, italique, titres et listes", () => {
    const target = createEditor();
    pasteHtml(target, WEB_PAGE);
    const blocks = structure(target);
    expect(blocks[0]).toEqual({
      type: "heading",
      attrs: { level: 1 },
      content: [text("Les volcans")],
    });
    expect(blocks[1]?.content).toEqual([
      text("Un "),
      text("volcan", ["bold"]),
      text(" est une "),
      text("montagne", ["italic"]),
      text(" qui crache du feu."),
    ]);
    expect(blocks[2]?.type).toBe("bulletList");
    expect(
      blocks[2]?.content?.map((item) => item.content?.[0]?.content?.map((t) => t.text).join("")),
    ).toEqual(["Etna", "Vésuve 🌋"]);
  });

  it("critère 2 : ne garde ni police, ni taille, ni couleur, ni fond, ni alignement d'origine", () => {
    const target = createEditor();
    pasteHtml(target, WEB_PAGE);
    const json = JSON.stringify(target.getJSON());
    expect(json).not.toMatch(/textStyle|fontFamily|fontSize|color|background|Georgia|Comic|Arial/);
    expect(json).not.toContain('textAlign":"center');
  });

  it("critère 4 : images, vidéos, scripts et styles sont ignorés, le texte d'un tableau est gardé, sans erreur", () => {
    const target = createEditor();
    expect(() => pasteHtml(target, WEB_PAGE)).not.toThrow();
    const all = target.state.doc.textContent;
    expect(all).not.toMatch(/piège|color: red|volcan\.jpg|film/);
    expect(all).toContain("Hauteur");
    expect(all).toContain("3 357 m");
    target.state.doc.check();
  });

  it("critère 2 : le texte collé prend la police et la taille du curseur", () => {
    const target = createEditor({
      type: "doc",
      content: [
        p({
          type: "text",
          text: "Ici",
          marks: [{ type: "textStyle", attrs: { fontFamily: "EB Garamond", fontSize: "14pt" } }],
        }),
      ],
    });
    target.commands.setTextSelection(4);
    pasteHtml(target, '<p><span style="font-family: Arial; font-size: 30px">collé</span></p>');
    const pasted = target.state.doc.firstChild?.lastChild;
    expect(target.state.doc.textContent).toBe("Icicollé");
    expect(pasted?.marks.map((mark) => mark.attrs)).toEqual([
      { fontFamily: "EB Garamond", fontSize: "14pt", color: null },
    ]);
  });
});

describe("collage depuis Word (T1.5)", () => {
  // Extrait typique du presse-papiers de Word pour Windows : listes en paragraphes `mso-list`.
  const WORD = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>
    p.MsoNormal { font-family: Calibri; }</style></head><body lang=FR>
    <!--StartFragment-->
    <h2><span style="font-size:16.0pt;font-family:'Calibri Light';color:#2F5496">Compte rendu</span></h2>
    <p class=MsoNormal style="text-align:justify"><b><span style="font-family:Calibri">Présents</span></b><span style="font-family:Calibri"> : toute la famille<o:p></o:p></span></p>
    <p class=MsoListParagraphCxSpFirst style="text-indent:-18.0pt;mso-list:l0 level1 lfo1"><![if !supportLists]><span style="font-family:Symbol"><span style="mso-list:Ignore">·<span style="font:7.0pt 'Times New Roman'">&nbsp;&nbsp; </span></span></span><![endif]>Courses<o:p></o:p></p>
    <p class=MsoListParagraphCxSpMiddle style="margin-left:72.0pt;text-indent:-18.0pt;mso-list:l0 level2 lfo1"><![if !supportLists]><span style="font-family:'Courier New'"><span style="mso-list:Ignore">o<span style="font:7.0pt 'Times New Roman'">&nbsp;&nbsp; </span></span></span><![endif]><i>pain</i><o:p></o:p></p>
    <p class=MsoListParagraphCxSpLast style="text-indent:-18.0pt;mso-list:l0 level1 lfo1"><![if !supportLists]><span style="font-family:Symbol"><span style="mso-list:Ignore">·<span style="font:7.0pt 'Times New Roman'">&nbsp;&nbsp; </span></span></span><![endif]>Ménage<o:p></o:p></p>
    <p class=MsoNormal><o:p>&nbsp;</o:p></p>
    <p class=MsoListParagraph style="text-indent:-18.0pt;mso-list:l1 level1 lfo2"><![if !supportLists]><span><span style="mso-list:Ignore">1.<span style="font:7.0pt 'Times New Roman'">&nbsp;&nbsp; </span></span></span><![endif]>Première étape<o:p></o:p></p>
    <p class=MsoListParagraph style="text-indent:-18.0pt;mso-list:l1 level1 lfo2"><![if !supportLists]><span><span style="mso-list:Ignore">2.<span style="font:7.0pt 'Times New Roman'">&nbsp;&nbsp; </span></span></span><![endif]>Deuxième étape<o:p></o:p></p>
    <!--EndFragment--></body></html>`;

  it("critère 1 : garde le titre, le gras, l'italique et transforme les listes de Word en vraies listes", () => {
    const target = createEditor();
    pasteHtml(target, WORD);
    // Le paragraphe vide de Word (`&nbsp;`) entre les deux listes est gardé comme paragraphe.
    const blocks = structure(target);
    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "bulletList",
      "paragraph",
      "orderedList",
    ]);
    const bullets = blocks.find((block) => block.type === "bulletList");
    const [courses, menage] = bullets?.content ?? [];
    expect(courses?.content?.[0]?.content).toEqual([text("Courses")]);
    expect(courses?.content?.[1]?.type).toBe("bulletList");
    expect(courses?.content?.[1]?.content?.[0]?.content?.[0]?.content).toEqual([
      text("pain", ["italic"]),
    ]);
    expect(menage?.content?.[0]?.content).toEqual([text("Ménage")]);
    const numbered = blocks.find((block) => block.type === "orderedList");
    expect(numbered?.content?.map((item) => item.content?.[0]?.content?.[0]?.text)).toEqual([
      "Première étape",
      "Deuxième étape",
    ]);
    expect(blocks[1]?.content?.[0]).toEqual(text("Présents", ["bold"]));
  });

  it("critère 2 : aucune police, taille, couleur ou justification de Word n'est gardée, ni les puces en texte", () => {
    const target = createEditor();
    pasteHtml(target, WORD);
    const json = JSON.stringify(target.getJSON());
    expect(json).not.toMatch(/textStyle|Calibri|Courier|2F5496|justify/);
    expect(target.state.doc.textContent).not.toMatch(/·|^o/);
  });
});

describe("collage depuis Google Docs (T1.5)", () => {
  const GOOGLE_DOCS = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1234"><h1 dir="ltr" style="line-height:1.38;margin-top:20pt"><span style="font-size:20pt;font-family:Arial,sans-serif;color:#000000;font-weight:400;">Recette</span></h1><p dir="ltr" style="line-height:1.38;text-align:center"><span style="font-size:11pt;font-family:Arial,sans-serif;font-weight:700;">Tarte</span><span style="font-size:11pt;font-family:Arial,sans-serif;font-weight:400;"> aux </span><span style="font-size:11pt;font-family:Arial,sans-serif;font-style:italic;">myrtilles</span></p><ol style="margin-top:0;margin-bottom:0;"><li dir="ltr" style="list-style-type:decimal;font-size:11pt;font-family:Arial,sans-serif;" aria-level="1"><p dir="ltr" role="presentation"><span style="font-size:11pt;">Étaler la pâte</span></p></li><li dir="ltr" aria-level="1"><p dir="ltr" role="presentation"><span>Garnir</span></p></li></ol></b>`;

  it("critère 1 et 2 : garde titre, gras, italique et liste ; le « gras » qui enveloppe tout est ignoré", () => {
    const target = createEditor();
    pasteHtml(target, GOOGLE_DOCS);
    const blocks = structure(target);
    expect(blocks[0]).toEqual({ type: "heading", attrs: { level: 1 }, content: [text("Recette")] });
    expect(blocks[1]).toEqual(
      p(text("Tarte", ["bold"]), text(" aux "), text("myrtilles", ["italic"])),
    );
    expect(blocks[2]?.type).toBe("orderedList");
    expect(blocks[2]?.content?.map((item) => item.content?.[0]?.content?.[0]?.text)).toEqual([
      "Étaler la pâte",
      "Garnir",
    ]);
    expect(JSON.stringify(target.getJSON())).not.toMatch(/textStyle|Arial|center/);
  });
});

describe("collage interne et identifiants (T1.5)", () => {
  const SOURCE: DocumentJson = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { id: "h-1", level: 2, textAlign: "center" },
        content: [text("Titre")],
      },
      {
        type: "paragraph",
        attrs: { id: "p-1", textAlign: "right" },
        content: [
          {
            type: "text",
            text: "Garamond 18",
            marks: [
              { type: "bold" },
              { type: "textStyle", attrs: { fontFamily: "EB Garamond", fontSize: "18pt" } },
            ],
          },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            attrs: { id: "li-1" },
            content: [{ type: "paragraph", attrs: { id: "p-2" }, content: [text("élément")] }],
          },
        ],
      },
    ],
  };

  it("la copie depuis Nano Buro porte la marque Nano Buro, et le gras, l'italique et les listes en HTML standard (critère 6)", () => {
    const source = createEditor(SOURCE);
    const { html, text: plain } = copyAll(source);
    expect(isNanoBuroHtml(html)).toBe(true);
    expect(html).toMatch(/<strong>/);
    expect(html).toMatch(/<ul[^>]*>.*<li/);
    expect(plain).toContain("Garamond 18");
  });

  it("critère 5 : le copier-coller interne garde toute la mise en forme, police, taille et alignement compris", () => {
    const source = createEditor(SOURCE);
    const { html } = copyAll(source);
    const before = structure(source);
    source.destroy();
    const target = createEditor();
    pasteHtml(target, html);
    expect(structure(target)).toEqual(before);
  });

  it("critère 8 : les blocs collés reçoivent de nouveaux identifiants, sans doublon avec les blocs existants", () => {
    const target = createEditor(SOURCE);
    const { html } = copyAll(target);
    target.commands.setTextSelection(target.state.doc.content.size - 1);
    pasteHtml(target, html);
    pasteHtml(target, html);
    const ids = blockIds(target);
    expect(ids.length).toBeGreaterThan(8);
    for (const id of ids) expect(typeof id === "string" && id !== "").toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    // Les blocs d'origine gardent leur identifiant.
    expect(ids.slice(0, 2)).toEqual(["h-1", "p-1"]);
  });

  it("critère 3 : le texte brut est collé sans mise en forme, un paragraphe par ligne", () => {
    const target = createEditor();
    pastePlainText(
      target,
      "Première ligne\nDeuxième : **pas de gras**\n1. pas de liste\n\n# pas de titre",
    );
    expect(structure(target)).toEqual([
      p(text("Première ligne")),
      p(text("Deuxième : **pas de gras**")),
      p(text("1. pas de liste")),
      p(text("# pas de titre")),
    ]);
  });

  it("critère 8 : un collage depuis un autre document Nano Buro ne reprend pas ses identifiants", () => {
    const source = createEditor(SOURCE);
    const { html } = copyAll(source);
    source.destroy();
    const target = createEditor();
    pasteHtml(target, html);
    const ids = blockIds(target);
    expect(ids.length).toBeGreaterThan(3);
    for (const id of ["h-1", "p-1", "li-1", "p-2"]) expect(ids).not.toContain(id);
  });

  it("un HTML extérieur qui contient seulement le mot data-nano-buro n'est pas pris pour une copie interne", () => {
    expect(
      isNanoBuroHtml('<p>data-nano-buro</p><span style="font-family: Comic Sans MS">x</span>'),
    ).toBe(false);
    const target = createEditor();
    pasteHtml(
      target,
      '<p data-nano-buro=""><span style="font-family: Comic Sans MS; font-size: 300pt">x</span></p>',
    );
    expect(JSON.stringify(target.getJSON())).not.toMatch(/Comic|300pt/);
  });
});
