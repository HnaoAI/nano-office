// Sommaire automatique dans l'éditeur (T2.17) : affichage des lignes (titre, retrait selon le niveau,
// points de conduite, numéro de page), mise à jour à chaque changement des titres, clic sur une ligne,
// ancres des titres pour les liens du PDF, insertion au curseur en une étape d'annulation, paragraphe
// après un sommaire final. Le nœud est défini dans src/core/tocSchema.ts, les lignes dans
// src/core/toc.ts ; les numéros de page viennent des repères de T2.8 (src/ui/useTableOfContents.ts).
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { Decoration, DecorationSet, type EditorView, type NodeView } from "@tiptap/pm/view";
import { BLOCK_ID_ATTRIBUTE } from "../core/schema";
import { hasToc, tocAnchor, tocEntries, tocLineText, type TocEntry } from "../core/toc";
import { TableOfContentsNode, TOC_ATTRIBUTE, TOC_NODE, TOC_TITLE } from "../core/tocSchema";
import { dispatchAsOneStep } from "./assistantEdits";
import { pageBreakInsertPoint } from "./pageBreak";

/** Phrase d'un sommaire sans titre, à l'écran seulement (elle ne s'imprime pas, print.css). */
export const EMPTY_TOC_TEXT =
  "Aucun titre pour l'instant : le sommaire se remplira avec les Titre 1, Titre 2 et Titre 3 du document.";

/** Nom de l'événement envoyé par un clic sur une ligne (détail : la ligne), écouté par l'interface. */
export const TOC_GO_EVENT = "nano-toc-go";

/**
 * Lignes et numéros de page des sommaires d'un éditeur. Les vues des sommaires s'y abonnent : elles se
 * redessinent quand un titre change (critère 3), sans que leur nœud change.
 */
export class TocState {
  entries: TocEntry[] = [];
  pages: ReadonlyMap<string, number> = new Map();
  private readonly listeners = new Set<() => void>();

  /** Remplace les lignes ; ne prévient les vues que si elles changent. */
  setEntries(entries: TocEntry[]): void {
    if (JSON.stringify(entries) === JSON.stringify(this.entries)) return;
    this.entries = entries;
    this.notify();
  }

  /** Remplace les numéros de page ; ne prévient les vues que s'ils changent. */
  setPages(pages: ReadonlyMap<string, number>): void {
    if (JSON.stringify([...pages]) === JSON.stringify([...this.pages])) return;
    this.pages = pages;
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

/** État des sommaires d'un éditeur, ou null si l'extension n'est pas chargée. */
export function tocState(editor: Editor): TocState | null {
  const storage = (editor.storage as unknown as Record<string, { state?: TocState } | undefined>)[
    TOC_NODE
  ];
  return storage?.state ?? null;
}

/** Vue d'un sommaire : titre « Sommaire », puis une ligne cliquable par titre du document. */
class TocView implements NodeView {
  readonly dom: HTMLElement;
  private readonly list: HTMLOListElement;
  private readonly empty: HTMLParagraphElement;
  private readonly unsubscribe: () => void;

  constructor(
    private node: ProseMirrorNode,
    private readonly state: TocState,
  ) {
    this.dom = document.createElement("nav");
    this.dom.className = "nano-toc";
    this.dom.setAttribute(TOC_ATTRIBUTE, "");
    this.dom.setAttribute("aria-label", TOC_TITLE);
    this.dom.contentEditable = "false";
    const title = document.createElement("div");
    title.className = "nano-toc-title";
    title.textContent = TOC_TITLE;
    this.list = document.createElement("ol");
    this.list.className = "nano-toc-list";
    this.empty = document.createElement("p");
    this.empty.className = "nano-toc-empty";
    this.empty.textContent = EMPTY_TOC_TEXT;
    this.dom.append(title, this.list, this.empty);
    this.dom.addEventListener("click", (event) => this.onClick(event));
    this.unsubscribe = state.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const id: unknown = this.node.attrs[BLOCK_ID_ATTRIBUTE];
    if (typeof id === "string") this.dom.dataset.id = id;
    const { entries, pages } = this.state;
    this.empty.hidden = entries.length > 0;
    this.list.replaceChildren(
      ...entries.map((entry, index) => {
        const item = document.createElement("li");
        item.className = "nano-toc-entry";
        item.dataset.level = String(entry.level);
        const link = document.createElement("a");
        link.dataset.tocIndex = String(index);
        if (entry.id) link.href = `#${tocAnchor(entry.id)}`;
        const text = document.createElement("span");
        text.className = "nano-toc-text";
        text.textContent = tocLineText(entry);
        const leader = document.createElement("span");
        leader.className = "nano-toc-leader";
        leader.setAttribute("aria-hidden", "true");
        const page = document.createElement("span");
        page.className = "nano-toc-page";
        const number = entry.id === null ? undefined : pages.get(entry.id);
        page.textContent = number === undefined ? "" : String(number);
        link.append(text, leader, page);
        item.append(link);
        return item;
      }),
    );
  }

  /** Un clic sur une ligne amène au titre (critère 2) : l'interface fait défiler sous la barre figée. */
  private onClick(event: MouseEvent): void {
    const link = event.target instanceof Element ? event.target.closest("a") : null;
    if (!link) return;
    event.preventDefault();
    const entry = this.state.entries[Number(link.dataset.tocIndex)];
    if (entry)
      this.dom.dispatchEvent(new CustomEvent(TOC_GO_EVENT, { bubbles: true, detail: entry }));
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  /** Les lignes gèrent elles-mêmes la souris ; ailleurs, un clic sélectionne le sommaire entier. */
  stopEvent(event: Event): boolean {
    return event.target instanceof Element && event.target.closest("a") !== null;
  }

  /** Le contenu de la vue n'est modifié que par elle-même. */
  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.unsubscribe();
  }
}

/**
 * Identifiant HTML de chaque titre de premier niveau, cible des liens du sommaire dans le PDF
 * (critère 5). Seulement quand le document contient un sommaire ; rien n'est écrit dans le document.
 */
function anchorDecorations(doc: ProseMirrorNode): DecorationSet {
  if (!hasToc(doc)) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.forEach((node, offset) => {
    const id: unknown = node.attrs[BLOCK_ID_ATTRIBUTE];
    if (node.type.name === "heading" && typeof id === "string" && id !== "") {
      decorations.push(Decoration.node(offset, offset + node.nodeSize, { id: tocAnchor(id) }));
    }
  });
  return DecorationSet.create(doc, decorations);
}

const anchorsKey = new PluginKey<DecorationSet>("tocAnchors");

/** Plugin des sommaires : lignes relues à chaque modification, ancres des titres, paragraphe final. */
function createTocPlugin(state: TocState): Plugin {
  return new Plugin<DecorationSet>({
    key: anchorsKey,
    state: {
      init: (_config, editorState) => anchorDecorations(editorState.doc),
      apply: (tr, previous, _old, editorState) =>
        tr.docChanged ? anchorDecorations(editorState.doc) : previous,
    },
    props: {
      decorations: (editorState) => anchorsKey.getState(editorState),
    },
    view(view: EditorView) {
      state.setEntries(tocEntries(view.state.doc));
      return {
        update(updated, previous) {
          if (!updated.state.doc.eq(previous.doc)) state.setEntries(tocEntries(updated.state.doc));
        },
      };
    },
    // Un sommaire qui termine le document est suivi d'un paragraphe vide, pour pouvoir écrire après.
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      const { doc, schema } = newState;
      const paragraph = schema.nodes.paragraph;
      if (doc.lastChild?.type.name !== TOC_NODE || !paragraph) return null;
      const tr = newState.tr.insert(doc.content.size, paragraph.create());
      if (transactions.every((change) => change.getMeta("addToHistory") === false)) {
        tr.setMeta("addToHistory", false);
      }
      return tr;
    },
  });
}

/**
 * Nœud « sommaire » de l'éditeur : celui du schéma partagé, avec sa vue, son état et son plugin. Il
 * remplace `TableOfContentsNode` à la même place dans les extensions (editorOptions.ts), comme l'image.
 */
export const TableOfContentsEditorNode = TableOfContentsNode.extend<object, { state: TocState }>({
  addStorage() {
    return { state: new TocState() };
  },
  addNodeView() {
    const state = this.storage.state;
    return ({ node }) => new TocView(node, state);
  },
  addProseMirrorPlugins() {
    return [createTocPlugin(this.storage.state)];
  },
});

/**
 * Insère un sommaire au curseur (critère 1), en une étape d'annulation, comme un saut de page : avant un
 * paragraphe vide ou au début d'un paragraphe, après un paragraphe, une liste ou un tableau, ou au
 * milieu d'un paragraphe coupé en deux. Un texte sélectionné est remplacé ; des cellules sélectionnées ne
 * sont jamais effacées. Le curseur se place après le sommaire.
 * @returns faux si le schéma n'a pas de sommaire
 */
export function insertTableOfContents(editor: Editor): boolean {
  const { state } = editor;
  const type = state.schema.nodes[TOC_NODE];
  const paragraph = state.schema.nodes.paragraph;
  if (!type || !paragraph) return false;
  const tr = state.tr;
  const replaces =
    !state.selection.empty &&
    !(state.selection instanceof NodeSelection) &&
    !(state.selection instanceof CellSelection);
  if (replaces) tr.deleteSelection();
  const { pos, mode } = pageBreakInsertPoint(tr.selection);
  const toc = type.create();
  let cursor: number;
  if (mode === "split") {
    tr.split(pos);
    tr.insert(pos + 1, toc);
    cursor = pos + 1 + toc.nodeSize + 1;
  } else if (mode === "before") {
    tr.insert(pos, toc);
    cursor = pos + toc.nodeSize + 1;
  } else {
    tr.insert(pos, [toc, paragraph.create()]);
    cursor = pos + toc.nodeSize + 1;
  }
  tr.setSelection(TextSelection.create(tr.doc, cursor));
  dispatchAsOneStep(editor, tr.scrollIntoView());
  return true;
}
