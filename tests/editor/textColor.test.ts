// @vitest-environment jsdom
// Tests de la couleur du texte et du surlignage (src/editor/textColor.ts, T1.7) : application et
// retrait, état du bouton, copier-coller interne et extérieur, HTML copié vers un e-mail.
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import { HIGHLIGHT_COLORS, TEXT_COLORS } from "../../src/core/documentColors";
import {
  currentHighlight,
  currentTextColor,
  setHighlight,
  setTextColor,
} from "../../src/editor/textColor";
import { copyAll, createTestEditor, docOf, pasteHtml, textNode } from "./editorHelpers";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function start(content = docOf(textNode("Le prix est de 12 euros"))): Editor {
  editor = createTestEditor(content);
  return editor;
}

const RED = "#C62828";
const YELLOW = "#FFF176";

/** Marques du morceau de texte qui contient `fragment`. */
function marksOf(target: Editor, fragment: string): { type: string; attrs: object }[] {
  let found: { type: string; attrs: object }[] | null = null;
  target.state.doc.descendants((node) => {
    if (node.isText && node.text?.includes(fragment)) {
      found = node.marks.map((mark) => ({ type: mark.type.name, attrs: mark.attrs }));
    }
    return true;
  });
  if (!found) throw new Error(`texte absent : ${fragment}`);
  return found;
}

/** Sélectionne `fragment` dans le premier paragraphe. */
function select(target: Editor, fragment: string): void {
  const start = target.state.doc.textContent.indexOf(fragment) + 1;
  target.commands.setTextSelection({ from: start, to: start + fragment.length });
}

describe("T1.7 : palettes", () => {
  it("critère 3 : sept couleurs du texte, Automatique d'abord", () => {
    expect(TEXT_COLORS.map((color) => [color.name, color.value])).toEqual([
      ["Automatique", null],
      ["Gris", "#6B6B68"],
      ["Rouge", "#C62828"],
      ["Orange", "#D84315"],
      ["Vert", "#2E7D32"],
      ["Bleu", "#1565C0"],
      ["Violet", "#6A1B9A"],
    ]);
  });

  it("critère 4 : cinq surlignages, Aucun d'abord", () => {
    expect(HIGHLIGHT_COLORS.map((color) => [color.name, color.value])).toEqual([
      ["Aucun", null],
      ["Jaune", "#FFF176"],
      ["Vert", "#C5E1A5"],
      ["Bleu", "#B3E5FC"],
      ["Rose", "#F8BBD0"],
    ]);
  });
});

describe("T1.7 : appliquer et retirer", () => {
  it("critère 5 : la couleur s'applique à la sélection, et Automatique la retire", () => {
    const target = start();
    select(target, "12 euros");
    setTextColor(target, RED);
    expect(marksOf(target, "12 euros")).toEqual([
      { type: "textStyle", attrs: { color: RED, fontFamily: null, fontSize: null } },
    ]);
    expect(marksOf(target, "Le prix")).toEqual([]);
    setTextColor(target, null);
    expect(marksOf(target, "12 euros")).toEqual([]);
  });

  it("critère 5 : Automatique garde la police et la taille choisies", () => {
    const style = { type: "textStyle", attrs: { fontFamily: "EB Garamond", fontSize: "14pt" } };
    const target = start(docOf(textNode("Garamond", style)));
    target.commands.selectAll();
    setTextColor(target, RED);
    setTextColor(target, null);
    expect(marksOf(target, "Garamond")).toEqual([
      { type: "textStyle", attrs: { color: null, fontFamily: "EB Garamond", fontSize: "14pt" } },
    ]);
  });

  it("critère 5 : le surlignage s'applique à la sélection, et Aucun le retire", () => {
    const target = start();
    select(target, "12 euros");
    setHighlight(target, YELLOW);
    expect(marksOf(target, "12 euros")).toEqual([{ type: "highlight", attrs: { color: YELLOW } }]);
    setHighlight(target, null);
    expect(marksOf(target, "12 euros")).toEqual([]);
  });

  it("critère 5 : sans sélection, la couleur et le surlignage s'appliquent au texte tapé ensuite", () => {
    const target = start(docOf(textNode("Avant ")));
    target.commands.setTextSelection(7);
    setTextColor(target, RED);
    setHighlight(target, YELLOW);
    target.commands.insertContent("rouge");
    expect(
      marksOf(target, "rouge")
        .map((mark) => mark.type)
        .sort(),
    ).toEqual(["highlight", "textStyle"]);
    expect(marksOf(target, "Avant")).toEqual([]);
  });

  it("critère 5 : sans sélection, Automatique et Aucun retirent la mise en forme du texte tapé ensuite", () => {
    const red = { type: "textStyle", attrs: { color: RED } };
    const yellow = { type: "highlight", attrs: { color: YELLOW } };
    const target = start(docOf(textNode("Rouge", red, yellow)));
    target.commands.setTextSelection(6);
    setTextColor(target, null);
    setHighlight(target, null);
    target.commands.insertContent(" normal");
    expect(marksOf(target, " normal")).toEqual([]);
  });

  it("une couleur et un surlignage se remplacent sans s'ajouter", () => {
    const target = start();
    select(target, "12 euros");
    setTextColor(target, RED);
    setTextColor(target, "#1565C0");
    setHighlight(target, YELLOW);
    setHighlight(target, "#F8BBD0");
    const marks = marksOf(target, "12 euros");
    expect(marks.filter((mark) => mark.type === "textStyle")).toHaveLength(1);
    expect(marks).toContainEqual({ type: "highlight", attrs: { color: "#F8BBD0" } });
    expect(currentTextColor(target.state)).toEqual({ mixed: false, value: "#1565C0" });
  });
});

describe("T1.7 : état des boutons", () => {
  it("critère 6 : le bouton montre la couleur sous le curseur, Automatique hors du texte coloré", () => {
    const target = start(
      docOf(textNode("noir "), textNode("rouge", { type: "textStyle", attrs: { color: RED } })),
    );
    target.commands.setTextSelection(3);
    expect(currentTextColor(target.state)).toEqual({ mixed: false, value: null });
    target.commands.setTextSelection(9);
    expect(currentTextColor(target.state)).toEqual({ mixed: false, value: RED });
  });

  it("critère 6 : une sélection qui mélange plusieurs couleurs laisse le bouton neutre", () => {
    const target = start(
      docOf(textNode("noir "), textNode("rouge", { type: "textStyle", attrs: { color: RED } })),
    );
    target.commands.selectAll();
    expect(currentTextColor(target.state)).toEqual({ mixed: true });
    select(target, "rouge");
    expect(currentTextColor(target.state)).toEqual({ mixed: false, value: RED });
  });

  it("critère 6 : la couleur choisie sans sélection s'affiche tout de suite", () => {
    const target = start(docOf(textNode("noir")));
    target.commands.setTextSelection(5);
    setTextColor(target, RED);
    expect(currentTextColor(target.state)).toEqual({ mixed: false, value: RED });
  });

  it("le surlignage sous le curseur est lu de la même façon", () => {
    const target = start(
      docOf(textNode("a "), textNode("jaune", { type: "highlight", attrs: { color: YELLOW } })),
    );
    select(target, "jaune");
    expect(currentHighlight(target.state)).toEqual({ mixed: false, value: YELLOW });
    target.commands.selectAll();
    expect(currentHighlight(target.state)).toEqual({ mixed: true });
  });
});

describe("T1.7 : copier-coller", () => {
  const COLORED = docOf(
    textNode("Le "),
    textNode("12 mai", { type: "highlight", attrs: { color: YELLOW } }),
    textNode(" à "),
    textNode("12 euros", { type: "textStyle", attrs: { color: RED } }),
  );

  it("critère 7 : un copier-coller depuis Nano Buro garde la couleur et le surlignage", () => {
    const source = start(COLORED);
    const { html } = copyAll(source);
    source.destroy();
    const target = createTestEditor();
    editor = target;
    pasteHtml(target, html);
    expect(marksOf(target, "12 euros")).toEqual([
      { type: "textStyle", attrs: { color: RED, fontFamily: null, fontSize: null } },
    ]);
    expect(marksOf(target, "12 mai")).toEqual([{ type: "highlight", attrs: { color: YELLOW } }]);
  });

  it("critère 7 : un collage depuis une autre application retire couleurs et surlignages", () => {
    const target = start(docOf(textNode("x")));
    pasteHtml(
      target,
      `<p><span style="color: #C62828">rouge</span> <mark>marqué</mark> <mark style="background-color: #FFF176">jaune</mark> <span style="background-color: yellow">fond</span></p>`,
    );
    expect(target.state.doc.textContent).toContain("rouge marqué jaune fond");
    expect(JSON.stringify(target.getJSON())).not.toMatch(/color|highlight|textStyle/);
  });

  it("critère 7 : un collage extérieur dans du texte rouge ne prend pas la couleur du curseur", () => {
    const target = start(
      docOf(
        textNode("Ici", {
          type: "textStyle",
          attrs: { color: RED, fontFamily: "EB Garamond", fontSize: "14pt" },
        }),
      ),
    );
    target.commands.setTextSelection(4);
    pasteHtml(target, "<p>collé</p>");
    expect(marksOf(target, "collé")).toEqual([
      { type: "textStyle", attrs: { color: null, fontFamily: "EB Garamond", fontSize: "14pt" } },
    ]);
  });

  it("une couleur de surlignage qui tenterait d'ajouter une propriété CSS n'est pas écrite", () => {
    const source = start(
      docOf(textNode("x", { type: "highlight", attrs: { color: "red; position: fixed" } })),
    );
    expect(copyAll(source).html).not.toContain("position");
  });

  it("critère 8 : le HTML copié porte la couleur et le surlignage en style, lisibles par un e-mail", () => {
    const source = start(COLORED);
    const { html } = copyAll(source);
    // Le navigateur écrit les couleurs du style en rgb() : #C62828 et #FFF176.
    expect(html).toMatch(/<span[^>]*style="color: rgb\(198, 40, 40\);?"[^>]*>12 euros<\/span>/);
    expect(html).toMatch(
      /<mark[^>]*style="background-color: rgb\(255, 241, 118\)[^"]*"[^>]*>12 mai<\/mark>/,
    );
  });
});
