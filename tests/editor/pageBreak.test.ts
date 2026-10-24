// @vitest-environment jsdom
// Saut de page dans l'éditeur (T2.8, critères 6 à 8) : schéma, insertion au curseur comme dans Word,
// paragraphe après un saut de page final, copier-coller interne et collage depuis Word ou Google Docs.
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { documentExtensions, documentSchema } from "../../src/core/schema";
import { BlockIdGenerator } from "../../src/editor/blockIds";
import { CleanClipboard } from "../../src/editor/clipboard";
import { TableNavigation } from "../../src/editor/tables";
import type { DocumentJson } from "../../src/core/types";
import { insertPageBreak, PageBreaks } from "../../src/editor/pageBreak";
import { formatShortcuts, matchesShortcut } from "../../src/editor/keyboardShortcuts";
import { copyAll, pasteHtml } from "./editorHelpers";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function para(id: string, value: string): DocumentJson {
  return {
    type: "paragraph",
    attrs: { id },
    content: value ? [{ type: "text", text: value }] : [],
  };
}

/** Éditeur de test avec le paragraphe ajouté après un saut de page final. */
function create(...content: DocumentJson[]): Editor {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: [
      ...documentExtensions,
      BlockIdGenerator,
      CleanClipboard,
      TableNavigation,
      PageBreaks,
    ],
    enableInputRules: false,
    enablePasteRules: false,
    content: { type: "doc", content },
  });
  return editor;
}

/** Types et textes des blocs de premier niveau. */
function blocks(target: Editor): string[] {
  const out: string[] = [];
  target.state.doc.forEach((node) => {
    out.push(node.type.name === "pageBreak" ? "—" : `${node.type.name}:${node.textContent}`);
  });
  return out;
}

/** Place le curseur après le `offset`-ième caractère du bloc de premier niveau `index`. */
function cursorIn(target: Editor, index: number, offset: number) {
  let pos = 0;
  target.state.doc.forEach((_node, nodePos, nodeIndex) => {
    if (nodeIndex === index) pos = nodePos + 1 + offset;
  });
  target.view.dispatch(target.state.tr.setSelection(TextSelection.create(target.state.doc, pos)));
}

describe("T2.8 : saut de page", () => {
  it("critère 8 : le saut de page est un bloc du document, jamais dans une liste ni dans un tableau", () => {
    const type = documentSchema.nodes.pageBreak;
    expect(type).toBeDefined();
    if (!type) return;
    expect(type.isAtom).toBe(true);
    expect(type.isBlock).toBe(true);
    expect(documentSchema.nodes.doc?.contentMatch.matchType(type)).toBeTruthy();
    expect(documentSchema.nodes.listItem?.contentMatch.matchType(type)).toBeFalsy();
    expect(documentSchema.nodes.tableCell?.contentMatch.matchType(type)).toBeFalsy();
    expect(type.spec.attrs ?? {}).toHaveProperty("id");
  });

  it("critère 6 : au milieu d'un paragraphe, la fin passe à la page suivante et le curseur la suit", () => {
    const target = create(para("p-1", "Avant après"));
    cursorIn(target, 0, 6);
    expect(insertPageBreak(target)).toBe(true);
    expect(blocks(target)).toEqual(["paragraph:Avant ", "—", "paragraph:après"]);
    expect(target.state.selection.$from.parentOffset).toBe(0);
    expect(target.state.selection.$from.parent.textContent).toBe("après");
  });

  it("critère 6 : au début d'un paragraphe, tout le paragraphe passe à la page suivante", () => {
    const target = create(para("p-1", "Un"), para("p-2", "Deux"));
    cursorIn(target, 1, 0);
    insertPageBreak(target);
    expect(blocks(target)).toEqual(["paragraph:Un", "—", "paragraph:Deux"]);
    expect(target.state.selection.$from.parent.textContent).toBe("Deux");
  });

  it("critère 6 : à la fin d'un paragraphe, un paragraphe vide commence la nouvelle page, comme dans Word", () => {
    const target = create(para("p-1", "Un"), para("p-2", "Deux"));
    cursorIn(target, 0, 2);
    insertPageBreak(target);
    expect(blocks(target)).toEqual(["paragraph:Un", "—", "paragraph:", "paragraph:Deux"]);
    expect(target.state.selection.$from.parent.textContent).toBe("");
    expect(target.state.selection.$from.index(0)).toBe(2);
  });

  it("critère 6 : le texte sélectionné est remplacé par le saut de page", () => {
    const target = create(para("p-1", "Un deux trois"));
    target.view.dispatch(
      target.state.tr.setSelection(TextSelection.create(target.state.doc, 4, 9)),
    );
    insertPageBreak(target);
    expect(blocks(target)).toEqual(["paragraph:Un ", "—", "paragraph:trois"]);
  });

  it("critère 6 : dans une liste ou un tableau, le saut de page se place après eux", () => {
    const target = create(
      {
        type: "bulletList",
        content: [{ type: "listItem", attrs: { id: "li-1" }, content: [para("p-1", "Élément")] }],
      },
      para("p-2", "Suite"),
    );
    target.commands.setTextSelection(4);
    insertPageBreak(target);
    expect(blocks(target)).toEqual(["bulletList:Élément", "—", "paragraph:", "paragraph:Suite"]);
  });

  it("critère 6 : un bloc sélectionné (saut de page) reste, le nouveau se place après lui", () => {
    const target = create(
      para("p-1", "Un"),
      { type: "pageBreak", attrs: { id: "b-1" } },
      para("p-2", "Deux"),
    );
    target.view.dispatch(target.state.tr.setSelection(NodeSelection.create(target.state.doc, 4)));
    insertPageBreak(target);
    expect(blocks(target)).toEqual(["paragraph:Un", "—", "—", "paragraph:", "paragraph:Deux"]);
  });

  it("critère 6 : Ctrl/Cmd+Entrée est le raccourci « Saut de page », à la touche physique", () => {
    for (const mac of [true, false]) {
      const shortcut = formatShortcuts(mac).find((candidate) => candidate.label === "Saut de page");
      expect(shortcut).toMatchObject({ code: "Enter", mod: true });
      if (!shortcut) continue;
      const event = new KeyboardEvent("keydown", {
        code: "Enter",
        key: "Enter",
        ctrlKey: !mac,
        metaKey: mac,
      });
      expect(matchesShortcut(event, shortcut, mac)).toBe(true);
      // Entrée seule ou Ctrl+Alt+Entrée (AltGr) n'insère pas de saut de page.
      expect(matchesShortcut(new KeyboardEvent("keydown", { code: "Enter" }), shortcut, mac)).toBe(
        false,
      );
      const altGr = new KeyboardEvent("keydown", { code: "Enter", ctrlKey: true, altKey: true });
      expect(matchesShortcut(altGr, shortcut, mac)).toBe(false);
    }
  });

  it("critère 7 : un saut de page qui termine le document est suivi d'un paragraphe, pour continuer à écrire", () => {
    const target = create(
      para("p-1", "Un"),
      { type: "pageBreak", attrs: { id: "b-1" } },
      para("p-2", ""),
    );
    target.commands.deleteRange({ from: 5, to: 7 });
    expect(blocks(target)).toEqual(["paragraph:Un", "—", "paragraph:"]);
  });

  it("critère 8 : chaque saut de page reçoit son identifiant", () => {
    const target = create(para("p-1", "Avant après"));
    cursorIn(target, 0, 6);
    insertPageBreak(target);
    const id: unknown = target.state.doc.child(1).attrs.id;
    expect(typeof id).toBe("string");
  });

  it("critère 8 : un copier-coller interne garde le saut de page, avec un nouvel identifiant", () => {
    const source = create(
      para("p-1", "Un"),
      { type: "pageBreak", attrs: { id: "b-1" } },
      para("p-2", "Deux"),
    );
    const { html } = copyAll(source);
    expect(html).toContain("data-page-break");
    expect(html).not.toContain("Saut de page");
    source.commands.setTextSelection(source.state.doc.content.size - 1);
    pasteHtml(source, html);
    const ids: unknown[] = [];
    source.state.doc.forEach((node) => {
      if (node.type.name === "pageBreak") ids.push(node.attrs.id);
    });
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("critère 8 : un saut de page de Word (`<br style=page-break-before:always>`) est reconnu", () => {
    const target = create(para("p-1", ""));
    pasteHtml(
      target,
      "<p class=MsoNormal>Premier<span><br clear=all style='mso-special-character:line-break;page-break-before:always'></span></p><p class=MsoNormal>Deuxième</p>",
    );
    expect(blocks(target).filter((block) => block === "—")).toHaveLength(1);
    expect(blocks(target).indexOf("—")).toBeGreaterThan(0);
  });

  it("critère 8 : un paragraphe de Word marqué `page-break-before: always` commence une nouvelle page", () => {
    const target = create(para("p-1", ""));
    pasteHtml(
      target,
      "<p class=MsoNormal>Premier</p><p class=MsoNormal style='page-break-before:always'>Deuxième</p>",
    );
    expect(blocks(target).filter((block) => block !== "paragraph:")).toEqual([
      "paragraph:Premier",
      "—",
      "paragraph:Deuxième",
    ]);
  });

  it("critère 8 : un saut de page de Google Docs (`<hr style=page-break-before:always>`) est reconnu", () => {
    const target = create(para("p-1", ""));
    pasteHtml(
      target,
      '<p>Premier</p><hr style="page-break-before:always;display:none;"><p>Deuxième</p>',
    );
    expect(blocks(target).filter((block) => block !== "paragraph:")).toEqual([
      "paragraph:Premier",
      "—",
      "paragraph:Deuxième",
    ]);
  });

  it("critère 6 : avec des cellules sélectionnées, rien n'est effacé et le saut de page suit le tableau", () => {
    const cell = (id: string, value: string): DocumentJson => ({
      type: "tableCell",
      attrs: { id },
      content: [para(`${id}-p`, value)],
    });
    const target = create(
      {
        type: "table",
        content: [
          { type: "tableRow", content: [cell("c-1", "X00"), cell("c-2", "X01")] },
          { type: "tableRow", content: [cell("c-3", "X10"), cell("c-4", "X11")] },
        ],
      },
      para("p-1", "Suite"),
    );
    const cells: number[] = [];
    target.state.doc.descendants((node, pos) => {
      if (node.type.name === "tableCell") cells.push(pos);
    });
    target.view.dispatch(
      target.state.tr.setSelection(
        CellSelection.create(target.state.doc, cells[0] ?? 0, cells[3] ?? 0),
      ),
    );
    insertPageBreak(target);
    expect(blocks(target)).toEqual(["table:X00X01X10X11", "—", "paragraph:", "paragraph:Suite"]);
  });

  it("critère 8 : un saut de page de Word dans une cellule collée est ignoré, sans couper le tableau", () => {
    const target = create(para("p-1", ""));
    pasteHtml(
      target,
      "<table><tr><td><p>Un<br style='page-break-before:always'>deux</p></td><td><p style='page-break-before:always'>Trois</p></td></tr></table>",
    );
    expect(blocks(target).filter((block) => block.startsWith("table"))).toHaveLength(1);
    expect(blocks(target)).not.toContain("—");
  });

  it("un `<br>` ou un `<hr>` ordinaire n'est pas un saut de page", () => {
    const target = create(para("p-1", ""));
    pasteHtml(target, "<p>Un<br>deux</p><hr><p>Trois</p>");
    expect(blocks(target)).not.toContain("—");
  });
});
