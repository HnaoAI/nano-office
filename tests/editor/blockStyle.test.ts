// Tests de la commande de style de bloc (src/editor/blockStyle.ts, T1.1), sur un état ProseMirror
// sans affichage.
import { describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { documentSchema, type BlockStyleLevel } from "../../src/core/schema";
import type { DocumentJson } from "../../src/core/types";
import { currentBlockStyle, setBlockStyle } from "../../src/editor/blockStyle";
import { paragraph } from "../core/helpers";

function stateWith(content: DocumentJson[], from: number, to = from): EditorState {
  const doc = documentSchema.nodeFromJSON({ type: "doc", content });
  return EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });
}

function run(state: EditorState, level: BlockStyleLevel): EditorState {
  let next = state;
  setBlockStyle(level)(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}

function blocks(state: EditorState) {
  return (state.doc.toJSON() as DocumentJson).content?.map((block) => ({
    type: block.type,
    level: block.attrs?.level,
    id: block.attrs?.id,
  }));
}

describe("setBlockStyle (T1.1)", () => {
  it("critère 2 et 10 : transforme le paragraphe du curseur en titre, en gardant son identifiant", () => {
    const state = run(stateWith([paragraph("p-1", { text: "abc" })], 2), 2);
    expect(blocks(state)).toEqual([{ type: "heading", level: 2, id: "p-1" }]);
    expect(blocks(run(state, 0))).toEqual([{ type: "paragraph", level: undefined, id: "p-1" }]);
  });

  it("critère 2 : transforme tous les paragraphes sélectionnés, chacun garde son identifiant", () => {
    const content = [paragraph("p-1", { text: "un" }), paragraph("p-2", { text: "deux" })];
    const state = run(stateWith(content, 1, 9), 3);
    expect(blocks(state)).toEqual([
      { type: "heading", level: 3, id: "p-1" },
      { type: "heading", level: 3, id: "p-2" },
    ]);
  });

  it("critère 3 : lit le style du curseur, null pour une sélection mélangée", () => {
    const content = [paragraph("p-1", { text: "un" }), paragraph("p-2", { text: "deux" })];
    const state = run(stateWith(content, 2), 1);
    expect(currentBlockStyle(state)).toBe(1);
    expect(
      currentBlockStyle(state.apply(state.tr.setSelection(TextSelection.create(state.doc, 6)))),
    ).toBe(0);
    expect(
      currentBlockStyle(state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 9)))),
    ).toBeNull();
  });

  it("ne fait rien si le bloc a déjà ce style", () => {
    const state = stateWith([paragraph("p-1", { text: "abc" })], 2);
    expect(setBlockStyle(0)(state)).toBe(false);
  });

  it("document vide : un paragraphe vide devient un titre", () => {
    const state = run(stateWith([paragraph("p-1")], 1), 1);
    expect(blocks(state)).toEqual([{ type: "heading", level: 1, id: "p-1" }]);
  });
});
