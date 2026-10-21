// @vitest-environment jsdom
// Tests des images dans l'éditeur, dans jsdom (T1.9) : place dans le schéma, point d'insertion,
// identifiant de bloc, alignement, texte de remplacement, collage, image manquante.
// La réduction (canvas) et le glisser-déposer sont testés dans Playwright (tests/e2e/images.spec.ts).
import { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { ImageNode } from "../../src/core/imageSchema";
import { readImage, storeImage } from "../../src/core/images";
import { documentExtensions, documentSchema } from "../../src/core/schema";
import type { DocumentJson } from "../../src/core/types";
import { currentAlignment, setAlignment } from "../../src/editor/alignment";
import { BlockIdGenerator } from "../../src/editor/blockIds";
import { CleanClipboard } from "../../src/editor/clipboard";
import {
  createImageExtensions,
  imageInsertPoint,
  insertImageNodes,
  selectedImage,
  setImageAlt,
} from "../../src/editor/images";
import { MISSING_IMAGE_TEXT } from "../../src/editor/imageView";
import { TableNavigation } from "../../src/editor/tables";
import { fakePng } from "../core/imageHelpers";
import { copyAll, pasteHtml } from "./editorHelpers";

const HASH = "a".repeat(64);

/** Éditeur avec les images reliées à `ydoc` (sans collaboration : le contenu est dans l'état). */
function imageEditor(content: DocumentJson, ydoc = new Y.Doc()): Editor {
  const images = createImageExtensions(ydoc, () => undefined);
  return new Editor({
    element: document.createElement("div"),
    extensions: [
      ...documentExtensions.map((extension) => (extension === ImageNode ? images.node : extension)),
      images.plugin,
      BlockIdGenerator,
      CleanClipboard,
      TableNavigation,
    ],
    enableInputRules: false,
    enablePasteRules: false,
    content,
  });
}

/** Éditeur prêt, comme après une première touche de l'utilisateur (voir « sélection de départ »). */
function usedEditor(content: DocumentJson, ydoc = new Y.Doc()): Editor {
  const editor = imageEditor(content, ydoc);
  // Une touche plutôt qu'un clic : jsdom ne sait pas situer un clic dans la page (elementFromPoint).
  editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true }));
  return editor;
}

const p = (id: string, text?: string): DocumentJson => ({
  type: "paragraph",
  attrs: { id },
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
const img = (hash = HASH, alt = ""): DocumentJson => ({
  type: "image",
  attrs: { id: "img-1", hash, alt, width: null },
});
const types = (editor: Editor) => (editor.getJSON().content ?? []).map((node) => node.type ?? "");

beforeEach(() => {
  let count = 0;
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: () => `blob:test/${String(++count)}` }),
  );
  URL.revokeObjectURL = () => undefined;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("schéma", () => {
  it("critère 3 : une image se place entre deux paragraphes du document", () => {
    const doc = documentSchema.nodeFromJSON({ type: "doc", content: [p("p-1"), img(), p("p-2")] });
    expect(() => {
      doc.check();
    }).not.toThrow();
  });

  it("critère 3 : une image ne se place ni dans une liste ni dans un tableau (hors périmètre)", () => {
    const inList = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [p("p-1"), img()] }],
        },
      ],
    };
    const inCell = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [{ type: "tableRow", content: [{ type: "tableCell", content: [img()] }] }],
        },
      ],
    };
    for (const json of [inList, inCell]) {
      expect(() => {
        documentSchema.nodeFromJSON(json).check();
      }).toThrow();
    }
  });
});

describe("point d'insertion", () => {
  const at = (editor: Editor, pos: number) => {
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)));
    return imageInsertPoint(editor.state);
  };

  it("critère 3 : au début d'un paragraphe, avant lui ; à la fin, après lui ; au milieu, il est coupé", () => {
    const editor = imageEditor({ type: "doc", content: [p("p-1", "Bonjour")] });
    expect(at(editor, 1)).toEqual({ pos: 0, split: false });
    expect(at(editor, 8)).toEqual({ pos: 9, split: false });
    expect(at(editor, 4)).toEqual({ pos: 4, split: true });
  });

  it("critère 3 : au milieu d'un paragraphe, l'image va entre les deux moitiés, chacune avec son identifiant", () => {
    const editor = imageEditor({ type: "doc", content: [p("p-1", "Bonjour")] });
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 4)));
    insertImageNodes(editor.view, [{ hash: HASH, alt: "" }]);
    const content = (editor.getJSON() as DocumentJson).content ?? [];
    expect(types(editor)).toEqual(["paragraph", "image", "paragraph"]);
    expect(content[0]?.content?.[0]?.text).toBe("Bon");
    expect(content[2]?.content?.[0]?.text).toBe("jour");
    const ids = content.map((node) => node.attrs?.id as unknown);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => typeof id === "string" && id !== "")).toBe(true);
  });

  it("critère 3 : dans un paragraphe vide, l'image se place devant lui et le curseur reste sur la ligne vide", () => {
    const editor = imageEditor({ type: "doc", content: [p("p-1", "Titre"), p("p-2")] });
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 8)));
    insertImageNodes(editor.view, [{ hash: HASH, alt: "" }]);
    expect(types(editor)).toEqual(["paragraph", "image", "paragraph"]);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(editor.state.selection.$from.index(0)).toBe(2);
  });

  it("critère 3 : une image insérée en fin de document est suivie d'un paragraphe vide pour continuer à écrire", () => {
    const editor = imageEditor({ type: "doc", content: [p("p-1", "Fin")] });
    editor.commands.focus("end");
    insertImageNodes(editor.view, [{ hash: HASH, alt: "" }]);
    expect(types(editor)).toEqual(["paragraph", "image", "paragraph"]);
  });

  it("critère 3 : dans une liste ou un tableau, l'image va après la liste ou le tableau", () => {
    const editor = imageEditor({ type: "doc", content: [p("p-1")] });
    editor.commands.toggleBulletList();
    editor.commands.insertContent("Pain");
    insertImageNodes(editor.view, [{ hash: HASH, alt: "" }]);
    expect(types(editor)).toEqual(["bulletList", "image", "paragraph"]);

    const table = imageEditor({ type: "doc", content: [p("p-1")] });
    table.commands.insertTable({ rows: 2, cols: 2 });
    insertImageNodes(table.view, [{ hash: HASH, alt: "" }]);
    expect(types(table).slice(0, 2)).toEqual(["table", "image"]);
  });

  it("critère 6 : deux images insérées ensemble arrivent dans l'ordre, en une seule étape", () => {
    const editor = imageEditor({ type: "doc", content: [p("p-1", "A")] });
    editor.commands.focus("end");
    insertImageNodes(editor.view, [
      { hash: HASH, alt: "un" },
      { hash: "b".repeat(64), alt: "deux" },
    ]);
    const alts = (editor.getJSON().content ?? [])
      .filter((node) => node.type === "image")
      .map((node) => node.attrs?.alt as unknown);
    expect(alts).toEqual(["un", "deux"]);
  });
});

describe("image sélectionnée", () => {
  it("un document qui commence par une image s'ouvre avec le curseur dans le premier texte : la première touche ne la remplace pas", () => {
    const editor = imageEditor({ type: "doc", content: [img(), p("p-1", "Lettre")] });
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    editor.commands.insertContent("X");
    expect(types(editor)).toEqual(["image", "paragraph"]);
  });

  const selectImage = (editor: Editor) => {
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 2)));
  };

  it("critère 3 : l'image reçoit son propre identifiant de bloc, différent de celui d'une copie", () => {
    const editor = usedEditor({ type: "doc", content: [p("p-1", "A"), img(), img()] });
    editor.view.dispatch(editor.state.tr.insertText("B", 2));
    const ids = (editor.getJSON().content ?? [])
      .filter((node) => node.type === "image")
      .map((node) => node.attrs?.id as unknown);
    expect(ids[0]).toBe("img-1");
    expect(ids[1]).not.toBe("img-1");
    expect(typeof ids[1]).toBe("string");
  });

  it("critère 4 : les boutons d'alignement alignent l'image sélectionnée", () => {
    const editor = usedEditor({ type: "doc", content: [p("p-1"), img(), p("p-2")] });
    selectImage(editor);
    expect(currentAlignment(editor.state)).toBe("left");
    setAlignment(editor, "center");
    expect(editor.getJSON().content?.[1]?.attrs?.textAlign).toBe("center");
    expect(currentAlignment(editor.state)).toBe("center");
    setAlignment(editor, "right");
    expect(editor.getJSON().content?.[1]?.attrs?.textAlign).toBe("right");
    setAlignment(editor, "left");
    expect(editor.getJSON().content?.[1]?.attrs?.textAlign).toBeNull();
  });

  it("critère 5 : le texte de remplacement se modifie, accents et emojis compris", () => {
    const editor = usedEditor({ type: "doc", content: [p("p-1"), img(HASH, "photo"), p("p-2")] });
    selectImage(editor);
    expect(selectedImage(editor.state)).toEqual({ alt: "photo" });
    expect(setImageAlt(editor, "  Mémé à la plage 👵🏽🌊  ")).toBe(true);
    expect(editor.getJSON().content?.[1]?.attrs?.alt).toBe("Mémé à la plage 👵🏽🌊");
    expect(selectedImage(editor.state)).toEqual({ alt: "Mémé à la plage 👵🏽🌊" });
  });

  it("critère 5 : sans image sélectionnée, rien n'est modifié", () => {
    const editor = usedEditor({ type: "doc", content: [p("p-1", "Texte"), img()] });
    expect(selectedImage(editor.state)).toBeNull();
    expect(setImageAlt(editor, "x")).toBe(false);
  });

  it("critère 4 : Suppr retire l'image sélectionnée", () => {
    const editor = usedEditor({ type: "doc", content: [p("p-1"), img(), p("p-2")] });
    selectImage(editor);
    editor.commands.deleteSelection();
    expect(types(editor)).toEqual(["paragraph", "paragraph"]);
  });
});

describe("affichage", () => {
  it("critère 9 : une image sans contenu affiche un cadre « Image manquante », sans plantage", () => {
    const editor = imageEditor({
      type: "doc",
      content: [p("p-1", "Avant"), img(), p("p-2", "Après")],
    });
    const missing = editor.view.dom.querySelector(".nano-image-missing");
    expect(missing?.textContent).toBe(MISSING_IMAGE_TEXT);
    expect(missing?.getAttribute("role")).toBe("img");
    expect(editor.view.dom.textContent).toContain("Après");
  });

  it("critère 9 : une image manquante s'affiche dès que son contenu arrive dans le document", () => {
    const ydoc = new Y.Doc();
    const hash = storeImage(new Y.Doc(), fakePng(1));
    const editor = imageEditor({ type: "doc", content: [img(hash, "logo")] }, ydoc);
    expect(editor.view.dom.querySelector("img")).toBeNull();
    storeImage(ydoc, fakePng(1));
    const shown = editor.view.dom.querySelector("img");
    expect(shown?.getAttribute("src")).toMatch(/^blob:/);
    expect(shown?.getAttribute("alt")).toBe("logo");
  });

  it("critère 4 : la largeur choisie est appliquée à l'image", () => {
    const ydoc = new Y.Doc();
    const hash = storeImage(ydoc, fakePng(1));
    const editor = imageEditor(
      { type: "doc", content: [{ type: "image", attrs: { hash, alt: "", width: 240 } }] },
      ydoc,
    );
    const frame = editor.view.dom.querySelector<HTMLElement>(".nano-image-frame");
    expect(frame?.style.width).toBe("240px");
  });
});

describe("copier-coller", () => {
  it("critère 10 : une image collée sous forme d'adresse http n'est pas gardée, le texte est collé", () => {
    const editor = imageEditor({ type: "doc", content: [p("p-1")] });
    pasteHtml(editor, '<p>Avant <img src="https://exemple.fr/photo.jpg" alt="photo"> après</p>');
    expect(types(editor)).not.toContain("image");
    expect(editor.getText()).toContain("Avant");
    expect(editor.getText()).toContain("après");
  });

  it("critère 6 : une image copiée depuis Nano Buro emporte son contenu en data:, avec son empreinte", () => {
    const ydoc = new Y.Doc();
    const hash = storeImage(ydoc, fakePng(1));
    const editor = imageEditor({ type: "doc", content: [p("p-1", "A"), img(hash, "logo")] }, ydoc);
    const { html } = copyAll(editor);
    expect(html).toContain(`data-hash="${hash}"`);
    expect(html).toContain('src="data:image/png;base64,');
    expect(html).toContain('alt="logo"');
  });

  it("critère 3 : une image collée dans le même document est une nouvelle image, avec un nouvel identifiant", () => {
    const ydoc = new Y.Doc();
    const hash = storeImage(ydoc, fakePng(1));
    const editor = imageEditor({ type: "doc", content: [img(hash, "logo"), p("p-1")] }, ydoc);
    editor.commands.focus("end");
    pasteHtml(editor, `<img data-hash="${hash}" alt="logo">`);
    const images = (editor.getJSON().content ?? []).filter((node) => node.type === "image");
    expect(images).toHaveLength(2);
    expect(images[1]?.attrs?.id).not.toBe(images[0]?.attrs?.id);
    expect(readImage(ydoc, hash)).not.toBeNull();
  });

  it("une image collée dans une cellule est retirée : le tableau n'est jamais coupé (hors périmètre)", () => {
    const editor = imageEditor({ type: "doc", content: [p("p-1")] });
    editor.commands.insertTable({ rows: 2, cols: 2 });
    pasteHtml(editor, `<p>Texte</p><img data-hash="${HASH}" alt=""><p>Suite</p>`);
    expect(types(editor).filter((type) => type === "table")).toHaveLength(1);
    expect(types(editor)).not.toContain("image");
    expect(editor.getText()).toContain("Texte");
  });
});
