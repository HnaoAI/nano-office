// @vitest-environment jsdom
// Tests de la recherche dans l'éditeur (src/editor/search.ts, T2.1) : occurrences dans tout le
// document, surlignage hors du document, suivant et précédent, remplacer, tout remplacer.
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import type { DocumentJson } from "../../src/core/types";
import {
  clearSearch,
  goToMatch,
  replaceAll,
  replaceCurrent,
  searchState,
  setSearch,
} from "../../src/editor/search";
import { createTestEditor, docOf, textNode } from "./editorHelpers";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function start(content: DocumentJson): Editor {
  editor = createTestEditor(content);
  return editor;
}

/** Texte de chaque occurrence trouvée. */
function found(target: Editor): string[] {
  return searchState(target).matches.map(({ from, to }) => target.state.doc.textBetween(from, to));
}

const RICH: DocumentJson = {
  type: "doc",
  content: [
    { type: "heading", attrs: { id: "h-1", level: 1 }, content: [textNode("Le chat")] },
    { type: "paragraph", attrs: { id: "p-1" }, content: [textNode("Un CHAT noir")] },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          attrs: { id: "li-1" },
          content: [{ type: "paragraph", attrs: { id: "p-2" }, content: [textNode("chaton")] }],
        },
      ],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              attrs: { id: "c-1" },
              content: [{ type: "paragraph", attrs: { id: "p-3" }, content: [textNode("Chat")] }],
            },
          ],
        },
      ],
    },
  ],
};

describe("T2.1 : rechercher", () => {
  it("critère 7 : la recherche couvre les titres, les listes et les cellules", () => {
    const target = start(RICH);
    setSearch(target, "chat", false);
    expect(found(target)).toEqual(["chat", "CHAT", "chat", "Chat"]);
  });

  it("critère 3 : « Respecter les majuscules »", () => {
    const target = start(RICH);
    setSearch(target, "chat", true);
    expect(found(target)).toEqual(["chat", "chat"]);
  });

  it("critère 3 : trouve un texte coupé par une mise en forme (bon**jour**)", () => {
    const target = start(docOf(textNode("bon"), textNode("jour", "bold"), textNode(" à tous")));
    setSearch(target, "bonjour", false);
    expect(found(target)).toEqual(["bonjour"]);
  });

  it("critère 2 : surligne toutes les occurrences, l'active à part, et sélectionne l'active", () => {
    const target = start(RICH);
    setSearch(target, "chat", false);
    expect(target.view.dom.querySelectorAll(".nano-search-match")).toHaveLength(4);
    expect(target.view.dom.querySelectorAll(".nano-search-match-active")).toHaveLength(1);
    const { from, to } = target.state.selection;
    expect(target.state.doc.textBetween(from, to)).toBe("chat");
  });

  it("critère 2 : suivant et précédent, en revenant au début", () => {
    const target = start(RICH);
    setSearch(target, "chat", false);
    expect(searchState(target).active).toBe(0);
    goToMatch(target, 1);
    expect(searchState(target).active).toBe(1);
    goToMatch(target, -1);
    goToMatch(target, -1);
    expect(searchState(target).active).toBe(3);
    goToMatch(target, 1);
    expect(searchState(target).active).toBe(0);
  });

  it("critère 7 : le surlignage n'entre jamais dans le document", () => {
    const target = start(RICH);
    const before = JSON.stringify(target.getJSON());
    let changed = false;
    target.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) changed = true;
    });
    setSearch(target, "chat", false);
    goToMatch(target, 1);
    expect(JSON.stringify(target.getJSON())).toBe(before);
    expect(target.getHTML()).not.toContain("nano-search");
    expect(changed).toBe(false);
    clearSearch(target);
    expect(target.view.dom.querySelectorAll(".nano-search-match")).toHaveLength(0);
  });

  it("critère 8 : un texte vide ne surligne rien", () => {
    const target = start(RICH);
    setSearch(target, "", false);
    expect(found(target)).toEqual([]);
    expect(target.view.dom.querySelectorAll(".nano-search-match")).toHaveLength(0);
  });

  it("critère 8 : 1 000 occurrences dans un long document, sans blocage", () => {
    const paragraphs = Array.from({ length: 200 }, (_, index) => ({
      type: "paragraph",
      attrs: { id: `p-${String(index)}` },
      content: [textNode("mot ".repeat(5) + "x".repeat(500))],
    }));
    const target = start({ type: "doc", content: paragraphs });
    const started = performance.now();
    setSearch(target, "mot", false);
    goToMatch(target, 1);
    expect(searchState(target).matches).toHaveLength(1000);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("T2.1 : remplacer", () => {
  it("critère 4 : Remplacer change l'occurrence active, puis passe à la suivante", () => {
    const target = start(docOf(textNode("chat, chat et chat")));
    setSearch(target, "chat", false);
    goToMatch(target, 1);
    replaceCurrent(target, "chien");
    expect(target.state.doc.textContent).toBe("chat, chien et chat");
    expect(searchState(target).active).toBe(1);
    const { from, to } = target.state.selection;
    expect(from).toBe(searchState(target).matches[1]?.from);
    expect(target.state.doc.textBetween(from, to)).toBe("chat");
  });

  it("critère 5 : le remplacement prend la mise en forme du début de l'occurrence", () => {
    const target = start(
      docOf(textNode("Le "), textNode("bon", "bold"), textNode("jour", "italic"), textNode(".")),
    );
    setSearch(target, "bonjour", false);
    replaceCurrent(target, "salut");
    const runs: [string, string[]][] = [];
    target.state.doc.firstChild?.forEach((child) =>
      runs.push([child.text ?? "", child.marks.map((mark) => mark.type.name)]),
    );
    expect(runs).toEqual([
      ["Le ", []],
      ["salut", ["bold"]],
      [".", []],
    ]);
  });

  it("critère 6 : Tout remplacer est une seule transaction et compte les remplacements", () => {
    const target = start(docOf(textNode("a b a b a")));
    setSearch(target, "a", false);
    let transactions = 0;
    target.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) transactions += 1;
    });
    expect(replaceAll(target, "é")).toBe(3);
    expect(target.state.doc.textContent).toBe("é b é b é");
    expect(transactions).toBe(1);
  });

  it("critère 8 : remplacement par un texte vide", () => {
    const target = start(docOf(textNode("très très bien")));
    setSearch(target, "très ", false);
    expect(replaceAll(target, "")).toBe(2);
    expect(target.state.doc.textContent).toBe("bien");
  });

  it("critère 8 : un remplacement qui contient le texte cherché ne boucle pas", () => {
    const target = start(docOf(textNode("chat chat")));
    setSearch(target, "chat", false);
    replaceCurrent(target, "chaton");
    replaceCurrent(target, "chaton");
    expect(target.state.doc.textContent).toBe("chaton chaton");
    // Cliqué encore : plus aucune occurrence après, rien ne change (relecture de la PR).
    expect(replaceCurrent(target, "chaton")).toBe(false);
    expect(replaceCurrent(target, "chaton")).toBe(false);
    expect(target.state.doc.textContent).toBe("chaton chaton");
    target.destroy();
    const again = start(docOf(textNode("chat chat")));
    setSearch(again, "chat", false);
    expect(replaceAll(again, "chat chat")).toBe(2);
    expect(again.state.doc.textContent).toBe("chat chat chat chat");
  });

  it("accents et emojis remplacés", () => {
    const target = start(docOf(textNode("Café 😀 et café 😀")));
    setSearch(target, "😀", false);
    expect(replaceAll(target, "🎉")).toBe(2);
    expect(target.state.doc.textContent).toBe("Café 🎉 et café 🎉");
  });
});

describe("T2.1 : remplacer, cas relevés en relecture", () => {
  it("« a a », chercher « a » et remplacer par « ab » plusieurs fois ne boucle pas", () => {
    const target = start(docOf(textNode("a a")));
    setSearch(target, "a", false);
    for (let i = 0; i < 5; i += 1) replaceCurrent(target, "ab");
    expect(target.state.doc.textContent).toBe("ab ab");
    expect(searchState(target).active).toBe(-1);
    goToMatch(target, 1);
    expect(searchState(target).active).toBe(0);
  });
});
