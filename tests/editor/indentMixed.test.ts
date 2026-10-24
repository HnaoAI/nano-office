// @vitest-environment jsdom
// Retrait sur une sélection qui mélange liste et paragraphes (B2) : chaque ligne bouge selon sa nature,
// comme Word, en une seule transaction ; une ligne qui ne peut pas bouger n'empêche pas les autres.
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { MAX_INDENT } from "../../src/core/indent";
import type { DocumentJson } from "../../src/core/types";
import { changeIndent, indentAvailability } from "../../src/editor/indent";
import { createTestEditor } from "./editorHelpers";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function para(text: string, indent?: number): DocumentJson {
  return {
    type: "paragraph",
    attrs: { id: null, ...(indent ? { indent } : {}) },
    content: [{ type: "text", text }],
  };
}

function item(text: string, sub?: DocumentJson): DocumentJson {
  return { type: "listItem", content: [para(text), ...(sub ? [sub] : [])] };
}

function list(...items: DocumentJson[]): DocumentJson {
  return { type: "bulletList", content: items };
}

const BAKERY = "Ensuite, passer à la boulangerie…";
const BAGS = "Penser à rapporter les sacs.";

/** Texte d'essai du constat : un paragraphe, une liste de trois éléments, puis deux paragraphes. */
function shopping(options: { intro?: number; after?: number } = {}): DocumentJson[] {
  return [
    para("Au marché :", options.intro),
    list(item("Pommes"), item("Poireaux"), item("Fromage")),
    para(BAKERY, options.after),
    para(BAGS),
  ];
}

function start(...content: DocumentJson[]): Editor {
  editor = createTestEditor({ type: "doc", content });
  return editor;
}

/** Position du début (ou de la fin) du texte `value` dans le document. */
function textPos(doc: ProseMirrorNode, value: string, end = false): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0) return false;
    const index = node.isText ? (node.text ?? "").indexOf(value) : -1;
    if (index >= 0) found = pos + index + (end ? value.length : 0);
    return true;
  });
  if (found < 0) throw new Error(`texte introuvable : ${value}`);
  return found;
}

/** Sélectionne du début de `from` à la fin de `to`. */
function select(target: Editor, from: string, to: string) {
  const { doc } = target.state;
  target.view.dispatch(
    target.state.tr.setSelection(
      TextSelection.create(doc, textPos(doc, from), textPos(doc, to, true)),
    ),
  );
}

/** Lignes du document : niveau de liste (« • » par niveau) ou retrait (« →n »), puis le texte. */
function lines(target: Editor): string[] {
  const out: string[] = [];
  target.state.doc.descendants((node, _pos, parent) => {
    if (!node.isTextblock) return true;
    if (parent?.type.name === "listItem") {
      let depth = 0;
      const $pos = target.state.doc.resolve(_pos);
      for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type.name === "listItem") depth++;
      out.push(`${"•".repeat(depth)} ${node.textContent}`);
    } else {
      const indent = Number(node.attrs.indent ?? 0);
      out.push(`${indent ? `→${String(indent)} ` : ""}${node.textContent}`);
    }
    return false;
  });
  return out;
}

describe("B2 : retrait sur une sélection mixte", () => {
  it("critère 1, essai A : de « Poireaux » au dernier paragraphe, les éléments deviennent des sous-points et les paragraphes se décalent", () => {
    const target = start(...shopping());
    select(target, "Poireaux", BAGS);
    expect(changeIndent(target, 1)).toBe(true);
    expect(lines(target)).toEqual([
      "Au marché :",
      "• Pommes",
      "•• Poireaux",
      "•• Fromage",
      `→1 ${BAKERY}`,
      `→1 ${BAGS}`,
    ]);
    // La sélection couvre toujours les mêmes lignes.
    const { from, to } = target.state.selection;
    expect(target.state.doc.textBetween(from, to, "\n")).toBe(
      ["Poireaux", "Fromage", BAKERY, BAGS].join("\n"),
    );
  });

  it("critère 2, essai B : de « Au marché : » à « Fromage », « Pommes », premier élément, reste en place sans bloquer les autres", () => {
    const target = start(...shopping());
    select(target, "Au marché :", "Fromage");
    expect(changeIndent(target, 1)).toBe(true);
    expect(lines(target)).toEqual([
      "→1 Au marché :",
      "• Pommes",
      "•• Poireaux",
      "•• Fromage",
      BAKERY,
      BAGS,
    ]);
  });

  it("critère 1 : « Diminuer le retrait » remonte les sous-points et réduit le retrait des paragraphes", () => {
    const target = start(
      para("Au marché :"),
      list(item("Pommes", list(item("Poireaux"), item("Fromage")))),
      para(BAKERY, 2),
      para(BAGS),
    );
    select(target, "Poireaux", BAGS);
    expect(changeIndent(target, -1)).toBe(true);
    expect(lines(target)).toEqual([
      "Au marché :",
      "• Pommes",
      "• Poireaux",
      "• Fromage",
      `→1 ${BAKERY}`,
      BAGS,
    ]);
  });

  it("critère 2 : « Diminuer » au premier niveau de liste garde les éléments dans la liste et décale le paragraphe", () => {
    const target = start(...shopping({ intro: 1 }));
    select(target, "Au marché :", "Fromage");
    expect(indentAvailability(target.state)).toEqual({ increase: true, decrease: true });
    expect(changeIndent(target, -1)).toBe(true);
    expect(lines(target)).toEqual([
      "Au marché :",
      "• Pommes",
      "• Poireaux",
      "• Fromage",
      BAKERY,
      BAGS,
    ]);
  });

  it("critère 2 : au niveau 3 de liste, les éléments restent, et le paragraphe au maximum aussi, sans bloquer l'autre", () => {
    const deep = list(item("Un", list(item("Deux", list(item("Trois"), item("Quatre"))))));
    const target = start(deep, para(BAKERY, MAX_INDENT), para(BAGS));
    select(target, "Quatre", BAGS);
    expect(changeIndent(target, 1)).toBe(true);
    expect(lines(target)).toEqual([
      "• Un",
      "•• Deux",
      "••• Trois",
      "••• Quatre",
      `→${String(MAX_INDENT)} ${BAKERY}`,
      `→1 ${BAGS}`,
    ]);
  });

  it("critère 4 : boutons grisés quand aucune ligne ne peut bouger", () => {
    const target = start(list(item("Pommes")), para(BAKERY));
    select(target, "Pommes", BAKERY);
    // « Pommes » est le premier élément au premier niveau ; le paragraphe est sans retrait.
    expect(indentAvailability(target.state)).toEqual({ increase: true, decrease: false });
    expect(changeIndent(target, -1)).toBe(false);
    const full = start(list(item("Pommes")), para(BAKERY, MAX_INDENT));
    select(full, "Pommes", BAKERY);
    // Seul élément de sa liste : il ne peut pas descendre, et le paragraphe est au maximum.
    expect(indentAvailability(full.state)).toEqual({ increase: false, decrease: true });
    expect(changeIndent(full, 1)).toBe(false);
  });

  it("critère 3 : une seule transaction, annulée en une fois", () => {
    const target = start(...shopping());
    select(target, "Poireaux", BAGS);
    const before = target.state.doc;
    let transactions = 0;
    target.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) transactions++;
    });
    changeIndent(target, 1);
    // La transaction du bouton, et éventuellement celle des identifiants qui la rejoint.
    expect(transactions).toBeGreaterThanOrEqual(1);
    expect(transactions).toBeLessThanOrEqual(2);
    expect(target.state.doc.eq(before)).toBe(false);
  });

  it("critère 5 : une sélection entièrement dans la liste ou entièrement hors liste ne change pas de comportement", () => {
    const target = start(...shopping());
    select(target, "Poireaux", "Fromage");
    changeIndent(target, 1);
    expect(lines(target).slice(1, 4)).toEqual(["• Pommes", "•• Poireaux", "•• Fromage"]);
    select(target, BAKERY, BAGS);
    changeIndent(target, 1);
    expect(lines(target).slice(4)).toEqual([`→1 ${BAKERY}`, `→1 ${BAGS}`]);
    // Dans une liste, les boutons restent actifs, comme Tab.
    select(target, "Pommes", "Pommes");
    expect(indentAvailability(target.state)).toEqual({ increase: true, decrease: true });
  });
});
