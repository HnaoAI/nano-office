// @vitest-environment jsdom
// Tests de l'encadré (T2.19) dans jsdom : schéma (ce qu'il contient et ne contient pas), encadrer, changer le style,
// retirer, sortir avec Entrée, identifiant, recherche, compte des mots, assistant, collages, image insérée dedans.
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { Fragment } from "@tiptap/pm/model";
import { documentSchema } from "../../src/core/schema";
import type { DocumentJson } from "../../src/core/types";
import { nodeStats } from "../../src/core/wordCount";
import { selectedParagraphs } from "../../src/editor/assistantEdits";
import {
  CalloutKeys,
  canWrapInCallout,
  currentCallout,
  removeCallout,
  setCallout,
} from "../../src/editor/callout";
import { imageInsertPoint } from "../../src/editor/imageInsert";
import { findInDocument } from "../../src/editor/search";
import { copyAll, createTestEditor, pasteHtml } from "./editorHelpers";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function para(id: string, text: string): DocumentJson {
  return {
    type: "paragraph",
    attrs: { id },
    ...(text ? { content: [{ type: "text", text }] } : {}),
  };
}

function callout(style: string, ...content: DocumentJson[]): DocumentJson {
  return { type: "callout", attrs: { id: "c-1", calloutStyle: style }, content };
}

function start(...content: DocumentJson[]): Editor {
  editor = createTestEditor({ type: "doc", content }, [CalloutKeys]);
  return editor;
}

/** Types des blocs de premier niveau, et ceux des blocs de chaque encadré. */
function shape(target: Editor): unknown[] {
  return ((target.getJSON() as DocumentJson).content ?? []).map((block) =>
    block.type === "callout"
      ? [
          `callout:${String(block.attrs?.calloutStyle)}`,
          ...(block.content ?? []).map((inner) => inner.type),
        ]
      : block.type,
  );
}

/** Place le curseur à la fin du texte `fragment`. */
function cursorAfter(target: Editor, fragment: string) {
  let found = -1;
  target.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(fragment)) {
      found = pos + (node.text.indexOf(fragment) + fragment.length);
    }
    return true;
  });
  if (found < 0) throw new Error(`texte absent : ${fragment}`);
  target.commands.setTextSelection(found);
}

function pressEnter(target: Editor) {
  const event = new KeyboardEvent("keydown", { key: "Enter", code: "Enter" });
  target.view.someProp("handleKeyDown", (handler) => handler(target.view, event));
}

const TABLE: DocumentJson = {
  type: "table",
  content: [
    {
      type: "tableRow",
      content: [{ type: "tableCell", attrs: { id: "t-1" }, content: [para("p-t", "cellule")] }],
    },
  ],
};

describe("T2.19 : encadré", () => {
  it("critère 3 : un encadré contient paragraphes, titres, listes et images, mais ni tableau, ni encadré, ni saut de page", () => {
    const type = documentSchema.nodes.callout;
    if (!type) throw new Error("nœud absent");
    const node = (json: DocumentJson) => documentSchema.nodeFromJSON(json);
    const allowed = [
      para("p", "texte"),
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "titre" }] },
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [para("p-l", "point")] }],
      },
      { type: "image", attrs: { hash: null } },
    ].map(node);
    expect(type.validContent(Fragment.from(allowed))).toBe(true);
    for (const refused of [TABLE, callout("border", para("p-2", "x")), { type: "pageBreak" }]) {
      expect(type.validContent(Fragment.from(node(refused)))).toBe(false);
    }
    // Ni une liste ni une cellule n'acceptent d'encadré.
    expect(documentSchema.nodes.listItem?.contentMatch.matchType(type)).toBeFalsy();
    expect(documentSchema.nodes.tableCell?.contentMatch.matchType(type)).toBeFalsy();
  });

  it("critère 1 : « Encadré » transforme les paragraphes sélectionnés en un encadré", () => {
    const target = start(
      para("p-1", "Avant"),
      para("p-2", "Consigne"),
      para("p-3", "Détail"),
      para("p-4", "Après"),
    );
    const from = 1 + target.state.doc.child(0).nodeSize;
    const to = from + target.state.doc.child(1).nodeSize + target.state.doc.child(2).nodeSize - 2;
    target.commands.setTextSelection({ from, to });
    expect(canWrapInCallout(target.state)).toBe(true);
    expect(setCallout(target, "border")).toBe(true);
    expect(shape(target)).toEqual([
      "paragraph",
      ["callout:border", "paragraph", "paragraph"],
      "paragraph",
    ]);
    // Les paragraphes gardent leurs identifiants.
    const inner = (target.getJSON() as DocumentJson).content?.[1]?.content?.map(
      (block) => block.attrs?.id,
    );
    expect(inner).toEqual(["p-2", "p-3"]);
  });

  it("critère 4 : l'encadré reçoit son propre identifiant de bloc", async () => {
    const { BlockIdGenerator } = await import("../../src/editor/blockIds");
    expect(BlockIdGenerator).toBeDefined();
    const target = start(para("p-1", "Consigne"));
    target.commands.setTextSelection(3);
    setCallout(target, "shaded");
    const id = (target.getJSON() as DocumentJson).content?.[0]?.attrs?.id;
    expect(typeof id).toBe("string");
    expect(id).not.toBe("p-1");
  });

  it("critère 1 : le même bouton, dans un encadré, le retire et rend les paragraphes tels quels", () => {
    const target = start(
      para("p-0", "Avant"),
      callout("border", para("p-1", "Un"), para("p-2", "Deux")),
    );
    cursorAfter(target, "Deux");
    expect(currentCallout(target.state)).not.toBeNull();
    expect(canWrapInCallout(target.state)).toBe(false);
    expect(removeCallout(target)).toBe(true);
    expect(shape(target)).toEqual(["paragraph", "paragraph", "paragraph"]);
    expect((target.getJSON() as DocumentJson).content?.map((block) => block.attrs?.id)).toEqual([
      "p-0",
      "p-1",
      "p-2",
    ]);
  });

  it("critère 2 : trois styles, et choisir un autre style dans un encadré le change", () => {
    const target = start(callout("border", para("p-1", "Un")));
    cursorAfter(target, "Un");
    setCallout(target, "border-shaded");
    expect(shape(target)).toEqual([["callout:border-shaded", "paragraph"]]);
    setCallout(target, "shaded");
    expect(shape(target)).toEqual([["callout:shaded", "paragraph"]]);
    expect(target.view.dom.querySelector(".nano-callout")?.getAttribute("data-callout")).toBe(
      "shaded",
    );
  });

  it("critère 3 : une sélection qui touche un tableau ou un saut de page ne peut pas être encadrée", () => {
    const target = start(para("p-1", "Avant"), TABLE, para("p-2", "Après"));
    target.commands.selectAll();
    expect(canWrapInCallout(target.state)).toBe(false);
    expect(setCallout(target, "border")).toBe(false);
    cursorAfter(target, "cellule");
    expect(canWrapInCallout(target.state)).toBe(false);
    const breaks = start(
      para("p-1", "Avant"),
      { type: "pageBreak", attrs: { id: "b-1" } },
      para("p-2", "Après"),
    );
    breaks.commands.selectAll();
    expect(canWrapInCallout(breaks.state)).toBe(false);
  });

  it("critère 3 : une liste et une image sélectionnées entrent dans l'encadré", () => {
    const target = start(
      {
        type: "bulletList",
        content: [{ type: "listItem", attrs: { id: "l-1" }, content: [para("p-1", "point")] }],
      },
      { type: "image", attrs: { id: "i-1", hash: null, alt: "" } },
      para("p-2", "Après"),
    );
    target.commands.selectAll();
    expect(setCallout(target, "border")).toBe(true);
    expect(shape(target)).toEqual([["callout:border", "bulletList", "image", "paragraph"]]);
  });

  it("critère 3 : Entrée deux fois sur une ligne vide en fin d'encadré en sort", () => {
    const target = start(callout("border", para("p-1", "Consigne")), para("p-2", "Suite"));
    cursorAfter(target, "Consigne");
    target.commands.splitBlock();
    expect(shape(target)).toEqual([["callout:border", "paragraph", "paragraph"], "paragraph"]);
    pressEnter(target);
    expect(shape(target)).toEqual([["callout:border", "paragraph"], "paragraph", "paragraph"]);
    // Le curseur est sur la nouvelle ligne, sous l'encadré.
    expect(currentCallout(target.state)).toBeNull();
    target.commands.insertContent("Hors du cadre");
    expect((target.getJSON() as DocumentJson).content?.[1]?.content?.[0]?.text).toBe(
      "Hors du cadre",
    );
  });

  it("critère 3 : Entrée sur une ligne vide au milieu de l'encadré, ou dans une liste de l'encadré, reste dedans", () => {
    const target = start(callout("border", para("p-1", ""), para("p-2", "Fin")));
    target.commands.setTextSelection(2);
    pressEnter(target);
    expect(shape(target)[0]).toEqual(["callout:border", "paragraph", "paragraph", "paragraph"]);
  });

  it("critère 3 : un encadré réduit à une ligne vide disparaît à la seconde Entrée", () => {
    const target = start(callout("border", para("p-1", "")));
    target.commands.setTextSelection(2);
    pressEnter(target);
    expect(shape(target)).toEqual(["paragraph"]);
  });

  it("critère 4 : le texte de l'encadré se cherche, se compte et s'envoie à l'assistant", () => {
    const target = start(para("p-0", "dehors"), callout("border", para("p-1", "Lire la consigne")));
    expect(findInDocument(target.state.doc, "consigne", false)).toHaveLength(1);
    expect(nodeStats(target.state.doc).words).toBe(4);
    target.commands.selectAll();
    expect(selectedParagraphs(target.state).map(({ text }) => text)).toEqual([
      "dehors",
      "Lire la consigne",
    ]);
  });

  it("critère 5 : gardé dans un collage interne, retiré d'un collage extérieur (le texte reste)", () => {
    const source = start(callout("border-shaded", para("p-1", "Résumé")));
    const { html } = copyAll(source);
    expect(html).toContain('data-callout="border-shaded"');
    const inside = createTestEditor();
    pasteHtml(inside, html);
    expect(shape(inside)).toEqual([["callout:border-shaded", "paragraph"]]);
    inside.destroy();

    const outside = createTestEditor();
    pasteHtml(outside, '<div data-callout="border"><p>Résumé</p></div><p>Suite</p>');
    expect(shape(outside)).toEqual(["paragraph", "paragraph"]);
    expect(outside.getText()).toContain("Résumé");
    outside.destroy();
  });

  it("critère 3 : un encadré collé dans une cellule, une liste ou un autre encadré y entre sans son cadre", () => {
    const source = start(callout("border", para("p-1", "Collé")));
    const { html } = copyAll(source);
    for (const [content, text] of [
      [TABLE, "cellule"],
      [callout("shaded", para("p-2", "Dans le cadre")), "Dans le cadre"],
      [
        {
          type: "bulletList",
          content: [{ type: "listItem", attrs: { id: "l-1" }, content: [para("p-3", "point")] }],
        },
        "point",
      ],
    ] as const) {
      const target = createTestEditor({ type: "doc", content: [content as DocumentJson] });
      cursorAfter(target, text);
      pasteHtml(target, html);
      let callouts = 0;
      target.state.doc.descendants((node) => {
        if (node.type.name === "callout") callouts++;
        return true;
      });
      expect(callouts, text).toBe(content.type === "callout" ? 1 : 0);
      expect(target.getText()).toContain("Collé");
      // Le tableau, la liste ou l'encadré n'est pas coupé en deux.
      let containers = 0;
      target.state.doc.forEach((node) => {
        if (node.type.name === content.type) containers++;
      });
      expect(containers, text).toBe(1);
      target.destroy();
    }
  });

  it("critère 3 : une image insérée depuis un paragraphe de l'encadré va dans l'encadré", () => {
    const target = start(callout("border", para("p-1", "Photo :")), para("p-2", "Après"));
    cursorAfter(target, "Photo :");
    const { pos } = imageInsertPoint(target.state);
    const $pos = target.state.doc.resolve(pos);
    expect($pos.parent.type.name).toBe("callout");
    // Image de l'encadré sélectionnée : la suivante vient après elle, toujours dans l'encadré.
    const withImage = start(
      callout(
        "border",
        { type: "image", attrs: { id: "i-1", hash: null, alt: "" } },
        para("p-1", "x"),
      ),
    );
    withImage.view.dispatch(
      withImage.state.tr.setSelection(NodeSelection.create(withImage.state.doc, 1)),
    );
    expect(
      withImage.state.doc.resolve(imageInsertPoint(withImage.state).pos).parent.type.name,
    ).toBe("callout");
  });
});
