// Tests du générateur d'identifiants de bloc (src/editor/blockIds.ts), sur un état ProseMirror
// sans affichage. L'extension de collaboration demande un navigateur : elle est testée dans tests/e2e/.
import { describe, expect, it } from "vitest";
import { splitBlock } from "@tiptap/pm/commands";
import { EditorState, Plugin, TextSelection, type Transaction } from "@tiptap/pm/state";
import { documentSchema } from "../../src/core/schema";
import type { DocumentJson } from "../../src/core/types";
import { BLOCK_IDS_ASSIGNED_META, createBlockIdPlugin } from "../../src/editor/blockIds";
import { paragraph } from "../core/helpers";

/** État dont les nouveaux identifiants sont prévisibles (`id-0`, `id-1`…), avec un espion. */
function createState(content?: DocumentJson[]): {
  state: EditorState;
  appendedAddToHistory: () => unknown;
} {
  let counter = 0;
  let appended: unknown = "absent";
  const spy = new Plugin({
    appendTransaction: (transactions) => {
      for (const tr of transactions) {
        if (tr.getMeta(BLOCK_IDS_ASSIGNED_META) === true) {
          appended = tr.getMeta("addToHistory");
        }
      }
      return null;
    },
  });
  const state = EditorState.create({
    schema: documentSchema,
    ...(content ? { doc: documentSchema.nodeFromJSON({ type: "doc", content }) } : {}),
    plugins: [createBlockIdPlugin(() => `id-${String(counter++)}`), spy],
  });
  return { state, appendedAddToHistory: () => appended };
}

/** Applique une transaction construite par `build`, plugins compris. */
function apply(state: EditorState, build: (tr: Transaction) => Transaction): EditorState {
  return state.applyTransaction(build(state.tr)).state;
}

/** Coupe le bloc à la position `pos`, comme la touche Entrée. */
function pressEnterAt(state: EditorState, pos: number): EditorState {
  let current = apply(state, (tr) => tr.setSelection(TextSelection.create(tr.doc, pos)));
  splitBlock(current, (tr) => {
    current = current.applyTransaction(tr).state;
  });
  return current;
}

/** Identifiants des paragraphes, dans l'ordre du document. */
function ids(state: EditorState): unknown[] {
  const values: unknown[] = [];
  state.doc.forEach((node) => values.push(node.attrs.id));
  return values;
}

describe("générateur d'identifiants de bloc", () => {
  it("critère 6 : un paragraphe créé avec Entrée au milieu reçoit un nouvel identifiant, sans doublon", () => {
    // splitBlock de ProseMirror copie les attributs : c'est le pire cas, le générateur doit le corriger.
    const state = pressEnterAt(createState([paragraph("p-1", { text: "abcd" })]).state, 3);
    expect(ids(state)).toEqual(["p-1", "id-0"]);
    expect(state.doc.child(1).textContent).toBe("cd");
  });

  it("critère 6 : Entrée en fin de paragraphe, plusieurs fois, ne crée aucun doublon", () => {
    let state = createState([paragraph("p-1", { text: "ab" })]).state;
    for (let i = 0; i < 5; i++) {
      state = pressEnterAt(state, state.doc.content.size - 1);
    }
    expect(ids(state)).toEqual(["p-1", "id-0", "id-1", "id-2", "id-3", "id-4"]);
  });

  it("critère 6 : Entrée en début de paragraphe ne crée aucun doublon", () => {
    const state = pressEnterAt(createState([paragraph("p-1", { text: "ab" })]).state, 1);
    expect(new Set(ids(state)).size).toBe(2);
    expect(ids(state)).toContain("p-1");
  });

  it("critère 6 : les identifiants existants ne changent pas quand on écrit", () => {
    const initial = createState([
      paragraph("p-1", { text: "un" }),
      paragraph("p-2", { text: "deux" }),
    ]);
    const state = apply(initial.state, (tr) => tr.insertText(" et demi é 😀 👨‍👩‍👧", 3));
    expect(ids(state)).toEqual(["p-1", "p-2"]);
    expect(initial.appendedAddToHistory()).toBe("absent");
  });

  it("donne un identifiant au paragraphe d'un document vide dès la première modification", () => {
    const state = apply(createState().state, (tr) => tr.insertText("Bonjour", 1));
    expect(ids(state)).toEqual(["id-0"]);
  });

  it("en cas de doublon, l'original garde son identifiant et la copie en reçoit un nouveau", () => {
    const initial = createState([
      paragraph("p-1", { text: "un" }),
      paragraph("p-2", { text: "deux" }),
    ]);
    // Copie de p-2 insérée avant p-1, comme un collage de paragraphe (T1.5).
    const copy = documentSchema.nodeFromJSON(paragraph("p-2", { text: "copie" }));
    const state = apply(initial.state, (tr) => tr.insert(0, copy));
    expect(ids(state)).toEqual(["id-0", "p-1", "p-2"]);
  });

  it("remplace un identifiant vide ou absent", () => {
    const initial = createState([paragraph("", { text: "un" }), { type: "paragraph" }]);
    const state = apply(initial.state, (tr) => tr.insertText("x", 1));
    expect(ids(state)).toEqual(["id-0", "id-1"]);
  });

  it("texte très long : mille paragraphes ont tous un identifiant distinct", () => {
    const nodes = Array.from({ length: 1000 }, (_, i) =>
      documentSchema.nodeFromJSON({
        type: "paragraph",
        content: [{ type: "text", text: `Paragraphe ${String(i)} àéîõü 👨‍👩‍👧` }],
      }),
    );
    const state = apply(createState().state, (tr) => tr.insert(0, nodes));
    const values = ids(state);
    expect(values).toHaveLength(1001);
    expect(new Set(values).size).toBe(1001);
    expect(values.every((value) => typeof value === "string" && value !== "")).toBe(true);
  });

  it("ne touche pas à l'historique si la modification ne vient pas de l'utilisateur", () => {
    // Les transactions de l'extension de collaboration (contenu reçu, annulation) portent ce méta.
    const initial = createState();
    const state = apply(initial.state, (tr) =>
      tr.insertText("x", 1).setMeta("addToHistory", false),
    );
    expect(ids(state)).toEqual(["id-0"]);
    expect(initial.appendedAddToHistory()).toBe(false);
  });

  it("laisse l'ajout d'identifiant dans la même étape d'annulation qu'une saisie", () => {
    const initial = createState();
    const state = apply(initial.state, (tr) => tr.insertText("x", 1));
    expect(ids(state)).toEqual(["id-0"]);
    expect(initial.appendedAddToHistory()).toBeUndefined();
  });

  it("par défaut, génère des UUID distincts", () => {
    let state = EditorState.create({ schema: documentSchema, plugins: [createBlockIdPlugin()] });
    state = apply(state, (tr) => tr.insertText("ab", 1));
    state = pressEnterAt(state, 2);
    const values = ids(state);
    expect(new Set(values).size).toBe(2);
    for (const value of values) {
      expect(value).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });
});
