// @vitest-environment jsdom
// Schémas dans l'éditeur (T2.20) : insertion au curseur en une étape d'annulation, identifiant du bloc,
// dessin SVG hors modification, ouverture et fermeture, actions enregistrées une à une et annulées une
// à une, recherche et remplacement dans les textes des formes, copier-coller interne d'un schéma.
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { readDiagram, type DiagramData } from "../../src/core/diagram";
import type { DocumentJson } from "../../src/core/types";
import {
  insertDiagram,
  openDiagramAt,
  type DiagramEditing,
  type DiagramEditorMount,
} from "../../src/editor/diagram";
import { createEditorOptions } from "../../src/editor/editorOptions";
import { replaceAll, replaceCurrent, searchState, setSearch } from "../../src/editor/search";
import { ydocFromJson } from "../core/helpers";
import { copyAll, pasteHtml } from "./editorHelpers";

let editor: Editor | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
  host?.remove();
  host = null;
});

const PROCESS: DiagramData = {
  shapes: [
    {
      id: "s-1",
      kind: "rounded",
      x: 20,
      y: 20,
      width: 160,
      height: 60,
      text: "Commande",
      fill: null,
    },
    {
      id: "s-2",
      kind: "diamond",
      x: 240,
      y: 10,
      width: 140,
      height: 100,
      text: "Payé ?",
      fill: null,
    },
    {
      id: "s-3",
      kind: "rectangle",
      x: 440,
      y: 20,
      width: 160,
      height: 60,
      text: "Livraison",
      fill: null,
    },
  ],
  arrows: [{ id: "a-1", from: "s-2", fromSide: "right", to: "s-3", toSide: "left", text: "oui" }],
};

function para(id: string, value: string): DocumentJson {
  return {
    type: "paragraph",
    attrs: { id },
    content: value ? [{ type: "text", text: value }] : [],
  };
}

function diagram(id: string, data: DiagramData): DocumentJson {
  return { type: "diagram", attrs: { id, shapes: data.shapes, arrows: data.arrows, height: null } };
}

/** Éditeur affiché dans la page, relié à un Y.Doc, avec un faux éditeur de formes qui garde sa session. */
function create(content: DocumentJson[], sessions: DiagramEditing[] = []): Editor {
  const ydoc = ydocFromJson({ type: "doc", content });
  const mount: DiagramEditorMount = (target, editing) => {
    sessions.push(editing);
    target.textContent = "éditeur de formes";
    return () => {
      target.textContent = "";
      sessions.splice(sessions.indexOf(editing), 1);
    };
  };
  host = document.createElement("div");
  document.body.append(host);
  editor = new Editor({ element: host, ...createEditorOptions(ydoc, undefined, mount) });
  return editor;
}

function types(target: Editor): string[] {
  const out: string[] = [];
  target.state.doc.forEach((node) => out.push(node.type.name));
  return out;
}

function diagramPos(target: Editor): number {
  let found = -1;
  target.state.doc.forEach((node, pos) => {
    if (found < 0 && node.type.name === "diagram") found = pos;
  });
  return found;
}

function dataOf(target: Editor): DiagramData {
  return readDiagram(target.state.doc.nodeAt(diagramPos(target))?.attrs);
}

describe("T2.20 : schémas dans l'éditeur", () => {
  it("critère 1 : « Insérer un schéma » insère un bloc vide au curseur, avec son identifiant, et l'ouvre", () => {
    const sessions: DiagramEditing[] = [];
    const target = create([para("p-1", "AvantAprès")], sessions);
    target.view.dispatch(
      target.state.tr.setSelection(TextSelection.create(target.state.doc, 1 + 5)),
    );
    expect(insertDiagram(target)).toBe(true);
    expect(types(target)).toEqual(["paragraph", "diagram", "paragraph"]);
    const node = target.state.doc.nodeAt(diagramPos(target));
    expect(typeof node?.attrs.id).toBe("string");
    expect(readDiagram(node?.attrs)).toEqual({ shapes: [], arrows: [] });
    expect(sessions).toHaveLength(1);
    // Une seule étape d'annulation : le schéma disparaît, le paragraphe est recollé.
    sessions[0]?.close();
    target.commands.undo();
    expect(types(target)).toEqual(["paragraph"]);
    expect(target.state.doc.textContent).toBe("AvantAprès");
  });

  it("critère 1 : un schéma en fin de document est suivi d'un paragraphe, pour écrire après", () => {
    const target = create([para("p-1", "Texte")]);
    target.commands.setTextSelection(6);
    insertDiagram(target);
    expect(types(target)).toEqual(["paragraph", "diagram", "paragraph"]);
  });

  it("critère 8 : hors modification, le schéma s'affiche en dessin SVG, avec son nom accessible", () => {
    const target = create([para("p-1", "Avant"), diagram("d-1", PROCESS)]);
    const block = target.view.dom.querySelector(".nano-diagram");
    expect(block?.getAttribute("data-id")).toBe("d-1");
    const svg = block?.querySelector("svg");
    expect(svg?.querySelectorAll("[data-shape-id]")).toHaveLength(3);
    expect(svg?.getAttribute("aria-label")).toBe("Schéma : Commande, Payé ?, Livraison, oui");
    expect(block?.querySelector(".nano-diagram-empty")?.hasAttribute("hidden")).toBe(true);
  });

  it("critère 1 : un double clic ouvre le schéma, Échap revient au texte avec le schéma sélectionné", () => {
    const sessions: DiagramEditing[] = [];
    const target = create([para("p-1", "Avant"), diagram("d-1", PROCESS)], sessions);
    const block = target.view.dom.querySelector<HTMLElement>(".nano-diagram");
    block?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(sessions).toHaveLength(1);
    expect(block?.querySelector(".nano-diagram-editor")?.textContent).toBe("éditeur de formes");
    block?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(sessions).toHaveLength(0);
    // La sélection du schéma après Échap est vérifiée dans Chromium (tests/e2e/schemas.spec.ts) : dans
    // jsdom, l'extension de collaboration la remplace par celle du navigateur.
    expect(block?.querySelector("svg")).not.toBeNull();
  });

  it("critère 1 : un clic à côté du schéma revient au texte", () => {
    const sessions: DiagramEditing[] = [];
    const target = create([para("p-1", "Avant"), diagram("d-1", PROCESS)], sessions);
    openDiagramAt(target, diagramPos(target));
    expect(sessions).toHaveLength(1);
    target.view.dom
      .querySelector("p")
      ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(sessions).toHaveLength(0);
  });

  it("critère 4 : chaque action est enregistrée dans le document et Ctrl/Cmd+Z en annule une à la fois", () => {
    const sessions: DiagramEditing[] = [];
    const target = create([para("p-1", "Avant"), diagram("d-1", PROCESS)], sessions);
    openDiagramAt(target, diagramPos(target));
    const editing = sessions[0];
    if (!editing) throw new Error("schéma non ouvert");
    let notified = 0;
    editing.subscribe(() => (notified += 1));
    const moved = {
      ...PROCESS,
      shapes: PROCESS.shapes.map((s) => (s.id === "s-1" ? { ...s, x: 60 } : s)),
    };
    editing.commit({ data: moved, height: null });
    const written = {
      ...moved,
      shapes: moved.shapes.map((s) => (s.id === "s-3" ? { ...s, text: "Envoi 🚚" } : s)),
    };
    editing.commit({ data: written, height: 300 });
    expect(dataOf(target).shapes[2]?.text).toBe("Envoi 🚚");
    expect(target.state.doc.nodeAt(diagramPos(target))?.attrs.height).toBe(300);
    expect(notified).toBe(2);
    editing.undo();
    expect(dataOf(target).shapes[2]?.text).toBe("Livraison");
    expect(dataOf(target).shapes[0]?.x).toBe(60);
    editing.undo();
    expect(dataOf(target).shapes[0]?.x).toBe(20);
    editing.redo();
    expect(dataOf(target).shapes[0]?.x).toBe(60);
    // L'identifiant du bloc ne change pas.
    expect(target.state.doc.nodeAt(diagramPos(target))?.attrs.id).toBe("d-1");
  });

  it("critère 10 : les textes des formes et des flèches se cherchent, le schéma est sélectionné", () => {
    const target = create([para("p-1", "La commande part."), diagram("d-1", PROCESS)]);
    setSearch(target, "commande", false);
    expect(searchState(target).matches).toHaveLength(2);
    setSearch(target, "oui", false);
    const state = searchState(target);
    expect(state.matches).toHaveLength(1);
    expect(state.matches[0]?.diagram?.itemId).toBe("a-1");
    // Le dessin surligne la flèche trouvée.
    const block = target.view.dom.querySelector(".nano-diagram");
    expect(block?.classList.contains("nano-search-match-active")).toBe(true);
    expect(block?.innerHTML).toContain('fill="#FFF176"');
  });

  it("critère 10 : « Remplacer » et « Tout remplacer » changent les textes des formes, en une annulation", () => {
    const target = create([
      para("p-1", "Commande"),
      diagram("d-1", {
        ...PROCESS,
        shapes: PROCESS.shapes.map((s) => ({ ...s, text: `${s.text} commande` })),
      }),
    ]);
    setSearch(target, "commande", false);
    expect(searchState(target).matches).toHaveLength(5);
    expect(replaceAll(target, "achat")).toBe(5);
    expect(target.state.doc.firstChild?.textContent).toBe("achat");
    expect(dataOf(target).shapes.map((shape) => shape.text)).toEqual([
      "achat achat",
      "Payé ? achat",
      "Livraison achat",
    ]);
    target.commands.undo();
    expect(dataOf(target).shapes[0]?.text).toBe("Commande commande");
  });

  it("critère 10 : « Remplacer » par un texte qui contient le texte cherché ne boucle pas", () => {
    const target = create([para("p-1", "x"), diagram("d-1", PROCESS)]);
    setSearch(target, "Payé", true);
    expect(replaceCurrent(target, "Payé ou non")).toBe(true);
    expect(dataOf(target).shapes[1]?.text).toBe("Payé ou non ?");
    expect(searchState(target).active).toBe(-1);
  });

  it("critère 7 : un schéma copié et collé dans le document garde ses formes, avec un nouvel identifiant", () => {
    const source = create([diagram("d-1", PROCESS), para("p-1", "")]);
    source.view.dispatch(source.state.tr.setSelection(NodeSelection.create(source.state.doc, 0)));
    const { html } = copyAll(source);
    expect(html).toContain("data-diagram");
    source.commands.setTextSelection(source.state.doc.content.size - 1);
    pasteHtml(source, html);
    const diagrams: DocumentJson[] = [];
    source.state.doc.forEach((node) => {
      if (node.type.name === "diagram") diagrams.push(node.toJSON() as DocumentJson);
    });
    expect(diagrams).toHaveLength(2);
    expect(readDiagram(diagrams[1]?.attrs)).toEqual(PROCESS);
    expect(diagrams[1]?.attrs?.id).not.toBe("d-1");
  });
});
