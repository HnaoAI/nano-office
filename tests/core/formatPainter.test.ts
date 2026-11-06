// Tests du calcul du pinceau (src/core/formatPainter.ts, PL4) : mise en forme copiée au curseur ou au début de la
// sélection, remplacement sur la cible (marque absente retirée), titres, listes, liens et objets laissés, mot cliqué.
import { describe, expect, it } from "vitest";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { Node as PmNode } from "@tiptap/pm/model";
import { documentSchema } from "../../src/core/schema";
import { applyFormat, captureFormat, wordRangeAt } from "../../src/core/formatPainter";
import type { DocumentJson } from "../../src/core/types";

type MarkJson = string | { type: string; attrs: Record<string, unknown> };

function text(value: string, ...marks: MarkJson[]): DocumentJson {
  return {
    type: "text",
    text: value,
    ...(marks.length > 0
      ? { marks: marks.map((mark) => (typeof mark === "string" ? { type: mark } : mark)) }
      : {}),
  };
}

function para(attrs: Record<string, unknown>, ...content: DocumentJson[]): DocumentJson {
  return { type: "paragraph", attrs, content };
}

function stateOf(...blocks: DocumentJson[]): EditorState {
  const doc = documentSchema.nodeFromJSON({ type: "doc", content: blocks });
  return EditorState.create({ schema: documentSchema, doc });
}

/** Position du début de `fragment` dans le texte du document (première occurrence). */
function posOf(state: EditorState, fragment: string): number {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.isText && node.text?.includes(fragment)) {
      found = pos + node.text.indexOf(fragment);
      return false;
    }
    return true;
  });
  if (found < 0) throw new Error(`texte introuvable : ${fragment}`);
  return found;
}

function withSelection(state: EditorState, from: number, to = from): EditorState {
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
}

/** Marques (nom et attributs non nuls) du caractère à la position `pos`. */
function marksAt(doc: PmNode, pos: number): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const mark of doc.resolve(pos + 1).marks()) {
    result[mark.type.name] = Object.fromEntries(
      Object.entries(mark.attrs).filter(([, value]) => value !== null),
    );
  }
  return result;
}

const RED_GARAMOND_16 = {
  type: "textStyle",
  attrs: { color: "#C62828", fontFamily: "EB Garamond", fontSize: "16pt" },
};

describe("PL4 : mise en forme copiée", () => {
  it("critère 2 : la mise en forme copiée est celle du curseur", () => {
    const base = stateOf(para({}, text("normal "), text("rouge", "bold", RED_GARAMOND_16)));
    const format = captureFormat(withSelection(base, posOf(base, "rouge") + 2));
    expect(format?.marks.map((mark) => mark.type.name).sort()).toEqual(["bold", "textStyle"]);
  });

  it("critère 2 : avec une sélection, la mise en forme copiée est celle du début de la sélection", () => {
    const base = stateOf(para({}, text("gras", "bold"), text("italique", "italic")));
    const from = posOf(base, "gras");
    const format = captureFormat(withSelection(base, from, posOf(base, "italique") + 3));
    expect(format?.marks.map((mark) => mark.type.name)).toEqual(["bold"]);
  });

  it("critère 3 : texte et paragraphe sont copiés, sans le lien", () => {
    const base = stateOf(
      para(
        { textAlign: "center", lineHeight: "1.5", indent: 2 },
        text(
          "source",
          "bold",
          "italic",
          "underline",
          "strike",
          "superscript",
          RED_GARAMOND_16,
          { type: "highlight", attrs: { color: "#FFF59D" } },
          { type: "link", attrs: { href: "https://exemple.fr" } },
        ),
      ),
    );
    const format = captureFormat(withSelection(base, posOf(base, "source") + 1));
    expect(format?.marks.map((mark) => mark.type.name).sort()).toEqual([
      "bold",
      "highlight",
      "italic",
      "strike",
      "superscript",
      "textStyle",
      "underline",
    ]);
    expect(format?.block).toEqual({ textAlign: "center", lineHeight: "1.5", indent: 2 });
  });

  it("critère 8 : une image choisie d'un clic ne donne aucune mise en forme", () => {
    const base = stateOf(para({}, text("avant")), {
      type: "image",
      attrs: { hash: "a".repeat(64) },
    });
    const imagePos = base.doc.firstChild?.nodeSize ?? 0;
    const selected = base.apply(base.tr.setSelection(NodeSelection.create(base.doc, imagePos)));
    expect(captureFormat(selected)).toBeNull();
  });

  it("cas limite : une source sans mise en forme copie un texte normal", () => {
    const base = stateOf(para({}, text("simple")));
    const format = captureFormat(withSelection(base, 2));
    expect(format).toEqual({
      marks: [],
      block: { textAlign: null, lineHeight: null, indent: null },
    });
  });
});

describe("PL4 : mise en forme appliquée", () => {
  it("critère 3 : la cible prend toute la mise en forme du texte et du paragraphe", () => {
    const base = stateOf(
      para({ textAlign: "center", lineHeight: "1.5" }, text("source", "bold", RED_GARAMOND_16)),
      para({}, text("cible")),
    );
    const format = captureFormat(withSelection(base, posOf(base, "source") + 1));
    if (!format) throw new Error("aucune mise en forme");
    const from = posOf(base, "cible");
    const doc = applyFormat(base, [{ from, to: from + 5 }], format)?.doc;
    if (!doc) throw new Error("aucune transaction");
    expect(marksAt(doc, from)).toEqual({
      bold: {},
      textStyle: { color: "#C62828", fontFamily: "EB Garamond", fontSize: "16pt" },
    });
    expect(doc.child(1).attrs).toMatchObject({ textAlign: "center", lineHeight: "1.5" });
    expect(doc.child(1).textContent).toBe("cible");
  });

  it("critère 4 : une marque absente de la source est retirée de la cible, le lien reste", () => {
    const base = stateOf(
      para(
        { textAlign: "right", lineHeight: "2", indent: 3 },
        text("normal "),
        text("gras", "bold", "italic", { type: "link", attrs: { href: "https://exemple.fr" } }),
      ),
    );
    const format = captureFormat(withSelection(base, 2));
    if (!format) throw new Error("aucune mise en forme");
    const from = posOf(base, "gras");
    const doc = applyFormat(base, [{ from, to: from + 4 }], format)?.doc;
    if (!doc) throw new Error("aucune transaction");
    expect(Object.keys(marksAt(doc, from))).toEqual(["link"]);
    // La source est le même paragraphe : ses attributs ne changent pas.
    expect(doc.child(0).attrs).toMatchObject({ textAlign: "right", lineHeight: "2", indent: 3 });
  });

  it("critère 4 : un paragraphe source aligné à gauche remet la cible à gauche, sans interligne ni retrait", () => {
    const base = stateOf(
      para({}, text("source")),
      para({ textAlign: "justify", lineHeight: "1.15", indent: 1 }, text("cible")),
    );
    const format = captureFormat(withSelection(base, 2));
    if (!format) throw new Error("aucune mise en forme");
    const from = posOf(base, "cible");
    const doc = applyFormat(base, [{ from, to: from + 1 }], format)?.doc;
    expect(doc?.child(1).attrs).toMatchObject({ textAlign: null, lineHeight: null, indent: null });
  });

  it("critère 3 : un titre garde son niveau, et un titre source ne fait pas de la cible un titre", () => {
    const base = stateOf(
      { type: "heading", attrs: { level: 2, textAlign: "center" }, content: [text("Titre")] },
      para({}, text("cible")),
      { type: "heading", attrs: { level: 1 }, content: [text("Autre")] },
    );
    const format = captureFormat(withSelection(base, posOf(base, "Titre") + 1));
    if (!format) throw new Error("aucune mise en forme");
    const ranges = [
      { from: posOf(base, "cible"), to: posOf(base, "cible") + 5 },
      { from: posOf(base, "Autre"), to: posOf(base, "Autre") + 5 },
    ];
    const doc = applyFormat(base, ranges, format)?.doc;
    expect(doc?.child(1).type.name).toBe("paragraph");
    expect(doc?.child(1).attrs.textAlign).toBe("center");
    expect(doc?.child(2).type.name).toBe("heading");
    expect(doc?.child(2).attrs).toMatchObject({ level: 1, textAlign: "center" });
  });

  it("critère 8 : dans une liste, l'élément garde sa liste et son niveau, sans retrait de paragraphe", () => {
    const base = stateOf(para({ indent: 2, lineHeight: "2" }, text("source", "italic")), {
      type: "bulletList",
      content: [{ type: "listItem", content: [para({}, text("élément"))] }],
    });
    const format = captureFormat(withSelection(base, 2));
    if (!format) throw new Error("aucune mise en forme");
    const from = posOf(base, "élément");
    const doc = applyFormat(base, [{ from, to: from + 7 }], format)?.doc;
    if (!doc) throw new Error("aucune transaction");
    expect(doc.child(1).type.name).toBe("bulletList");
    const item = doc.child(1).firstChild?.firstChild;
    expect(item?.attrs).toMatchObject({ lineHeight: "2", indent: null });
    expect(Object.keys(marksAt(doc, from))).toEqual(["italic"]);
  });

  it("critère 8 : dans un tableau, la cellule reçoit la mise en forme", () => {
    const cell = (value: string) => ({
      type: "tableCell",
      content: [para({}, text(value))],
    });
    const base = stateOf(para({}, text("source", "bold")), {
      type: "table",
      content: [{ type: "tableRow", content: [cell("un"), cell("deux")] }],
    });
    const format = captureFormat(withSelection(base, 2));
    if (!format) throw new Error("aucune mise en forme");
    const from = posOf(base, "deux");
    const doc = applyFormat(base, [{ from, to: from + 4 }], format)?.doc;
    if (!doc) throw new Error("aucune transaction");
    expect(Object.keys(marksAt(doc, from))).toEqual(["bold"]);
    expect(Object.keys(marksAt(doc, posOf(base, "un")))).toEqual([]);
  });

  it("critère 8 : une plage qui passe sur une image laisse l'image", () => {
    const base = stateOf(
      para({}, text("source", "bold")),
      { type: "image", attrs: { hash: "a".repeat(64) } },
      para({}, text("après")),
    );
    const format = captureFormat(withSelection(base, 2));
    if (!format) throw new Error("aucune mise en forme");
    const doc = applyFormat(base, [{ from: 1, to: base.doc.content.size - 1 }], format)?.doc;
    expect(doc?.child(1).type.name).toBe("image");
    expect(doc?.child(1).attrs.hash).toBe("a".repeat(64));
  });

  it("cas limite : accents, emojis et plusieurs paragraphes, texte inchangé", () => {
    const base = stateOf(
      para({}, text("modèle", "underline")),
      para({}, text("Élodie 😀 ")),
      para({}, text("çà et là")),
    );
    const format = captureFormat(withSelection(base, 2));
    if (!format) throw new Error("aucune mise en forme");
    const from = posOf(base, "Élodie");
    const to = posOf(base, "là") + 2;
    const doc = applyFormat(base, [{ from, to }], format)?.doc;
    if (!doc) throw new Error("aucune transaction");
    expect(doc.textBetween(0, doc.content.size, "|")).toBe("modèle|Élodie 😀 |çà et là");
    expect(Object.keys(marksAt(doc, posOf(base, "😀")))).toEqual(["underline"]);
    expect(Object.keys(marksAt(doc, posOf(base, "là")))).toEqual(["underline"]);
  });

  it("une plage vide (curseur hors d'un mot) change seulement le paragraphe et la frappe suivante", () => {
    const base = stateOf(
      para({ textAlign: "center" }, text("source", "bold")),
      para({}, text("a  b")),
    );
    const format = captureFormat(withSelection(base, 2));
    if (!format) throw new Error("aucune mise en forme");
    const pos = posOf(base, "  ") + 1;
    const tr = applyFormat(base, [{ from: pos, to: pos }], format);
    expect(tr?.doc.child(1).attrs.textAlign).toBe("center");
    expect(tr?.storedMarks?.map((mark) => mark.type.name)).toEqual(["bold"]);
  });
});

describe("PL4 : mot cliqué", () => {
  const base = stateOf(para({}, text("l'église du porte-monnaie, 😀 fin")));

  it("critère 5 : un simple clic dans un mot donne tout le mot, apostrophe et accents compris", () => {
    const start = posOf(base, "l'église");
    expect(wordRangeAt(base.doc, start + 3)).toEqual({ from: start, to: start + 8 });
  });

  it("critère 5 : au bord d'un mot, le mot touché est pris ; le trait d'union coupe le mot", () => {
    const start = posOf(base, "porte");
    expect(wordRangeAt(base.doc, start + 5)).toEqual({ from: start, to: start + 5 });
    const end = posOf(base, "fin") + 3;
    expect(wordRangeAt(base.doc, end)).toEqual({ from: end - 3, to: end });
  });

  it("cas limite : hors d'un mot (entre une virgule et un emoji), aucun mot", () => {
    expect(wordRangeAt(base.doc, posOf(base, "😀"))).toBeNull();
  });
});
