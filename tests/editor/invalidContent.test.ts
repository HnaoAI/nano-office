// @vitest-environment jsdom
// Contenu du Y.Doc que le schéma ne connaît pas (P1, règle produit 3) : depuis @tiptap/y-tiptap 3.1.0, le pont entre
// Tiptap et Yjs efface ce contenu du Y.Doc s'il n'est pas prévenu ; l'éditeur de Nano Buro ne l'efface jamais.
// Cas réel : une copie de secours faite par une version plus récente (marque ou bloc ajouté), rouverte après un retour
// en arrière de la version publiée.
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import * as Y from "yjs";
import { createEditorOptions } from "../../src/editor/editorOptions";
import { YJS_FRAGMENT_NAME } from "../../src/core/schema";
import { ydocFromJson } from "../core/helpers";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

/** Y.Doc d'un paragraphe dont le texte porte une marque inconnue, suivi d'un bloc inconnu. */
function futureDocument(): Y.Doc {
  const ydoc = ydocFromJson({
    type: "doc",
    content: [
      { type: "paragraph", attrs: { id: "connu" }, content: [{ type: "text", text: "Été 🌾" }] },
    ],
  });
  const fragment = ydoc.getXmlFragment(YJS_FRAGMENT_NAME);
  ydoc.transact(() => {
    const paragraph = new Y.XmlElement("paragraph");
    paragraph.setAttribute("id", "marque-future");
    const text = new Y.XmlText();
    text.insert(0, "Texte avec une marque future", { marqueFuture: {} });
    paragraph.insert(0, [text]);
    const block = new Y.XmlElement("blocFutur");
    block.setAttribute("id", "bloc-futur");
    fragment.insert(fragment.length, [paragraph, block]);
  });
  return ydoc;
}

describe("P1 : contenu inconnu du schéma", () => {
  it("critère 6 : l'éditeur n'efface jamais du Y.Doc une marque ou un bloc qu'il ne connaît pas", () => {
    const ydoc = futureDocument();
    const before = Y.encodeStateVector(ydoc);
    const deleted = () => {
      let count = 0;
      Y.createDeleteSetFromStructStore(ydoc.store).clients.forEach(
        (items) => (count += items.length),
      );
      return count;
    };
    const deletedBefore = deleted();
    editor = new Editor({ element: document.createElement("div"), ...createEditorOptions(ydoc) });
    const fragment = ydoc.getXmlFragment(YJS_FRAGMENT_NAME);
    expect(fragment.length).toBe(3);
    expect(fragment.toString()).toContain("Texte avec une marque future");
    expect(fragment.toString()).toContain("blocfutur");
    expect(deleted()).toBe(deletedBefore);
    expect(Y.encodeStateVector(ydoc)).toEqual(before);
  });
});
