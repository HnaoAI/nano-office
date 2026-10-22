// @vitest-environment jsdom
// Tests des propositions de l'assistant dans l'éditeur (src/editor/suggestions.ts et assistantEdits.ts,
// T3.1) : affichage hors du document, accepter une ou toutes les modifications avec la mise en forme
// gardée, refuser, disparition quand le texte change, texte sélectionné, traduction insérée.
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import { CellSelection } from "@tiptap/pm/tables";
import { correctionChanges, parseParagraphs } from "../../src/core/assistant";
import type { DocumentJson } from "../../src/core/types";
import {
  insertParagraphsAfter,
  replaceWithParagraphs,
  selectedParagraphs,
} from "../../src/editor/assistantEdits";
import {
  acceptSuggestions,
  clearSuggestions,
  goToSuggestion,
  rejectSuggestions,
  showSuggestions,
  suggestionsFor,
} from "../../src/editor/suggestionCommands";
import { suggestionState } from "../../src/editor/suggestions";
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

/** Document de plusieurs paragraphes de texte simple. */
function paragraphs(...texts: string[]): DocumentJson {
  return {
    type: "doc",
    content: texts.map((text, index) => ({
      type: "paragraph",
      attrs: { id: `p-${index + 1}` },
      content: [{ type: "text", text }],
    })),
  };
}

/** Sélectionne tout, puis affiche les propositions de la réponse `corrected` (un texte par paragraphe). */
function propose(target: Editor, corrected: string[], raw?: string): void {
  target.commands.selectAll();
  const sent = selectedParagraphs(target.state);
  const parsed = parseParagraphs(raw ?? JSON.stringify({ paragraphs: corrected }), sent.length);
  if (!parsed) throw new Error("réponse illisible");
  showSuggestions(target, suggestionsFor(sent, correctionChanges(sent, parsed)));
}

/** Propositions affichées, dans l'ordre du texte (au moins `count`). */
function shown(target: Editor, count: number) {
  const { suggestions } = suggestionState(target);
  expect(suggestions.length).toBeGreaterThanOrEqual(count);
  return suggestions.map((suggestion) => suggestion.id);
}

/** Morceaux de texte du premier paragraphe et leurs marques. */
/** Texte de chaque bloc de texte, dans l'ordre (listes et tableaux compris). */
function blockTexts(target: Editor): string[] {
  const texts: string[] = [];
  target.state.doc.descendants((node) => {
    if (!node.isTextblock) return true;
    texts.push(node.textContent);
    return false;
  });
  return texts;
}

function runs(target: Editor): [string, string[]][] {
  const result: [string, string[]][] = [];
  target.state.doc.firstChild?.forEach((child) => {
    result.push([child.text ?? "", child.marks.map((mark) => mark.type.name)]);
  });
  return result;
}

describe("T3.1 : propositions de correction dans l'éditeur", () => {
  it("critère 6 : le texte sélectionné est envoyé paragraphe par paragraphe, sans les blocs vides", () => {
    const target = start(paragraphs("Premier.", " ", "Troisième 😀"));
    target.commands.selectAll();
    expect(selectedParagraphs(target.state).map((paragraph) => paragraph.text)).toEqual([
      "Premier.",
      "Troisième 😀",
    ]);
  });

  it("critère 6 : seule la partie sélectionnée d'un paragraphe est envoyée", () => {
    const target = start(paragraphs("Avant. Phrase choisie. Après."));
    target.commands.setTextSelection({ from: 8, to: 23 });
    expect(selectedParagraphs(target.state).map((paragraph) => paragraph.text)).toEqual([
      "Phrase choisie.",
    ]);
  });

  it("critère 7 : les corrections s'affichent sans modifier le document", () => {
    const target = start(paragraphs("Les enfant joue."));
    const before = target.getJSON();
    propose(target, ["Les enfants jouent."]);
    expect(suggestionState(target).suggestions).toHaveLength(2);
    expect(target.getJSON()).toEqual(before);
    const dom = target.view.dom;
    expect(dom.querySelectorAll(".nano-suggest-removed")).toHaveLength(2);
    expect(
      [...dom.querySelectorAll(".nano-suggest-inserted")].map((node) => node.textContent),
    ).toEqual(["enfants", "jouent"]);
  });

  it("critère 9 : accepter applique une seule modification au document", () => {
    const target = start(paragraphs("Les enfant joue."));
    propose(target, ["Les enfants jouent."]);
    const [first = 0] = shown(target, 1);
    expect(acceptSuggestions(target, [first])).toBe(1);
    expect(target.state.doc.textContent).toBe("Les enfants joue.");
    // La proposition restante suit le texte, toujours juste.
    expect(suggestionState(target).suggestions.map((s) => [s.removed, s.insert])).toEqual([
      ["joue", "jouent"],
    ]);
    acceptSuggestions(target, "all");
    expect(target.state.doc.textContent).toBe("Les enfants jouent.");
    expect(suggestionState(target).suggestions).toEqual([]);
  });

  it("critère 9 : tout accepter applique toutes les modifications, dans plusieurs paragraphes", () => {
    const target = start(paragraphs("Il et parti.", "Ell est revenu."));
    propose(target, ["Il est parti.", "Elle est revenue."]);
    expect(acceptSuggestions(target, "all")).toBe(3);
    expect(target.getText({ blockSeparator: "\n" })).toBe("Il est parti.\nElle est revenue.");
  });

  it("critère 9 : la mise en forme du texte qui ne change pas est gardée", () => {
    const target = start(
      docOf(textNode("Un "), textNode("gran", "bold"), textNode(" chat", "italic")),
    );
    propose(target, ["Un grand chat"]);
    acceptSuggestions(target, "all");
    expect(runs(target)).toEqual([
      ["Un ", []],
      ["grand", ["bold"]],
      [" chat", ["italic"]],
    ]);
  });

  it("critère 9 : un texte remplacé prend la mise en forme du premier caractère qu'il remplace", () => {
    const target = start(
      docOf(textNode("Le "), textNode("cha", "bold"), textNode("tte dort", "italic")),
    );
    propose(target, ["Le chien dort"]);
    acceptSuggestions(target, "all");
    expect(runs(target)).toEqual([
      ["Le ", []],
      ["chien", ["bold"]],
      [" dort", ["italic"]],
    ]);
  });

  it("critère 8 : refuser retire la proposition sans changer le document", () => {
    const target = start(paragraphs("Les enfant joue."));
    propose(target, ["Les enfants jouent."]);
    const [first = 0] = shown(target, 1);
    rejectSuggestions(target, [first]);
    expect(target.state.doc.textContent).toBe("Les enfant joue.");
    expect(suggestionState(target).suggestions).toHaveLength(1);
    rejectSuggestions(target, "all");
    expect(suggestionState(target).suggestions).toEqual([]);
    expect(target.state.doc.textContent).toBe("Les enfant joue.");
  });

  it("critère 8 : la navigation passe d'une modification à l'autre et revient au début", () => {
    const target = start(paragraphs("Les enfant joue."));
    propose(target, ["Les enfants jouent."]);
    const [first, second] = shown(target, 2);
    expect(suggestionState(target).active).toBe(first);
    goToSuggestion(target, 1);
    expect(suggestionState(target).active).toBe(second);
    goToSuggestion(target, 1);
    expect(suggestionState(target).active).toBe(first);
    goToSuggestion(target, -1);
    expect(suggestionState(target).active).toBe(second);
  });

  it("critère 10 : modifier le texte concerné fait disparaître les propositions, sans rien changer", () => {
    const target = start(paragraphs("Les enfant joue.", "Autre paragraphe."));
    target.commands.setTextSelection({ from: 1, to: 17 });
    const sent = selectedParagraphs(target.state);
    const parsed = parseParagraphs('{"paragraphs":["Les enfants jouent."]}', sent.length);
    if (!parsed) throw new Error("réponse illisible");
    showSuggestions(target, suggestionsFor(sent, correctionChanges(sent, parsed)));
    // Une frappe dans un autre paragraphe ne touche pas les propositions.
    target.commands.insertContentAt(target.state.doc.content.size - 1, "!");
    expect(suggestionState(target).suggestions).toHaveLength(2);
    // Une frappe dans le paragraphe concerné les retire toutes.
    target.commands.insertContentAt(2, "x");
    expect(suggestionState(target).suggestions).toEqual([]);
    expect(target.state.doc.firstChild?.textContent).toBe("Lxes enfant joue.");
  });

  it("critère 10 : fermer la barre retire les propositions", () => {
    const target = start(paragraphs("Les enfant joue."));
    propose(target, ["Les enfants jouent."]);
    clearSuggestions(target);
    expect(suggestionState(target).suggestions).toEqual([]);
    expect(target.view.dom.querySelector(".nano-suggest-inserted")).toBeNull();
  });

  it("critère 11 : repli au paragraphe : le paragraphe entier est proposé, à accepter", () => {
    const target = start(paragraphs("Un paragrafe.", "Deux paragrafes."));
    propose(target, [], '{"paragraphs":["Un paragraphe. Deux paragraphes."]}');
    const suggestions = suggestionState(target).suggestions;
    expect(suggestions.map((suggestion) => suggestion.removed)).toEqual(["Un paragrafe."]);
    expect(target.getText({ blockSeparator: "\n" })).toBe("Un paragrafe.\nDeux paragrafes.");
    acceptSuggestions(target, "all");
    expect(target.getText({ blockSeparator: "\n" })).toBe(
      "Un paragraphe. Deux paragraphes.\nDeux paragrafes.",
    );
  });

  it("critère 16 : un texte ajouté qui ressemble à du HTML reste du texte", () => {
    const target = start(paragraphs("Bonjour."));
    propose(target, ['Bonjour <img src=x onerror="alert(1)">.']);
    expect(target.view.dom.querySelector("img")).toBeNull();
    acceptSuggestions(target, "all");
    expect(target.state.doc.textContent).toBe('Bonjour <img src=x onerror="alert(1)">.');
    expect(target.view.dom.querySelector("img")).toBeNull();
  });
});

describe("T3.1 : traduction insérée dans l'éditeur", () => {
  it("critère 12 : remplacer la sélection par un paragraphe garde la mise en forme du premier caractère", () => {
    const target = start(
      docOf(textNode("Avant "), textNode("bonjour", "bold"), textNode(" après")),
    );
    replaceWithParagraphs(target, [{ from: 7, to: 14 }], ["hello"], true);
    expect(runs(target)).toEqual([
      ["Avant ", []],
      ["hello", ["bold"]],
      [" après", []],
    ]);
  });

  it("critère 12 : remplacer par plusieurs paragraphes coupe le bloc sans paragraphe vide", () => {
    const target = start(paragraphs("Un. Deux."));
    replaceWithParagraphs(target, [{ from: 1, to: 10 }], ["One.", "Two."], false);
    expect(target.getText({ blockSeparator: "\n" })).toBe("One.\nTwo.");
  });

  it("critère 12 : insérer après ajoute des paragraphes après le bloc de la sélection", () => {
    const target = start(paragraphs("Bonjour.", "Suite."));
    insertParagraphsAfter(target, [{ from: 1, to: 9 }], ["Hello.", "Again."]);
    expect(target.getText({ blockSeparator: "\n" })).toBe("Bonjour.\nHello.\nAgain.\nSuite.");
  });

  it("critère 12 : tout sélectionner puis remplacer garde le titre, son alignement, son gras et son identifiant", () => {
    const target = start({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { id: "h-1", level: 1, textAlign: "center" },
          content: [{ type: "text", text: "Le chat dort.", marks: [{ type: "bold" }] }],
        },
        { type: "paragraph", attrs: { id: "p-1" }, content: [{ type: "text", text: "Il rêve." }] },
      ],
    });
    target.commands.selectAll();
    const sent = selectedParagraphs(target.state);
    replaceWithParagraphs(target, sent, ["The cat sleeps.", "It dreams."], true);
    const json = target.getJSON();
    expect(json.content?.[0]).toEqual({
      type: "heading",
      attrs: expect.objectContaining({ id: "h-1", level: 1, textAlign: "center" }) as unknown,
      content: [{ type: "text", text: "The cat sleeps.", marks: [{ type: "bold" }] }],
    });
    expect(json.content?.[1]?.type).toBe("paragraph");
    expect(json.content?.[1]?.attrs?.id).toBe("p-1");
    expect(target.getText({ blockSeparator: "\n" })).toBe("The cat sleeps.\nIt dreams.");
  });

  it("critère 12 : remplacer une liste traduit chaque élément à sa place", () => {
    const item = (id: string, text: string): DocumentJson => ({
      type: "listItem",
      attrs: { id },
      content: [{ type: "paragraph", attrs: { id: `${id}-p` }, content: [{ type: "text", text }] }],
    });
    const target = start({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [item("l-1", "Pain"), item("l-2", "Lait"), item("l-3", "Œufs")],
        },
      ],
    });
    target.commands.selectAll();
    const sent = selectedParagraphs(target.state);
    replaceWithParagraphs(target, sent, ["Bread", "Milk", "Eggs"], true);
    const list = target.state.doc.firstChild;
    expect(list?.type.name).toBe("bulletList");
    expect(list?.childCount).toBe(3);
    expect(blockTexts(target)).toEqual(["Bread", "Milk", "Eggs"]);
  });

  it("critère 12 : une réponse non alignée remplace dans le premier paragraphe et vide les autres, sans toucher aux blocs", () => {
    const target = start(paragraphs("Un.", "Deux.", "Trois."));
    target.commands.selectAll();
    const sent = selectedParagraphs(target.state);
    replaceWithParagraphs(target, sent, ["One.", "Two."], false);
    expect(target.state.doc.childCount).toBe(3);
    expect(target.getText({ blockSeparator: "\n" })).toBe("One. Two.\n\n");
  });

  it("critère 12 : une sélection de cellules est envoyée dans l'ordre du texte et remplacée cellule par cellule", () => {
    const cell = (id: string, text: string): DocumentJson => ({
      type: "tableCell",
      attrs: { id },
      content: [{ type: "paragraph", attrs: { id: `${id}-p` }, content: [{ type: "text", text }] }],
    });
    const target = start({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            { type: "tableRow", content: [cell("c-1", "un"), cell("c-2", "deux")] },
            { type: "tableRow", content: [cell("c-3", "trois"), cell("c-4", "quatre")] },
          ],
        },
      ],
    });
    const cells: number[] = [];
    target.state.doc.descendants((node, pos) => {
      if (node.type.name === "tableCell") cells.push(pos);
      return true;
    });
    const [first, , , last] = cells;
    if (first === undefined || last === undefined) throw new Error("tableau incomplet");
    target.view.dispatch(
      target.state.tr.setSelection(CellSelection.create(target.state.doc, first, last)),
    );
    const sent = selectedParagraphs(target.state);
    expect(sent.map((paragraph) => paragraph.text)).toEqual(["un", "deux", "trois", "quatre"]);
    replaceWithParagraphs(target, sent, ["one", "two", "three", "four"], true);
    // Le paragraphe vide final est celui que l'éditeur ajoute toujours après un tableau.
    expect(blockTexts(target)).toEqual(["one", "two", "three", "four", ""]);
  });
});
