// Copier-coller propre (T1.5) : un collage venu d'une autre application garde la structure
// (paragraphes, gras, italique, titres, listes) mais perd polices, tailles, couleurs, surlignages
// (T1.7), fonds et alignements ; un collage venu de Nano Buro garde toute la mise en forme. Les blocs collés
// reçoivent toujours de nouveaux identifiants. S'appuie sur les crochets de collage de ProseMirror.
import { Extension } from "@tiptap/core";
import {
  DOMSerializer,
  Fragment,
  Slice,
  type Mark,
  type Node as ProseMirrorNode,
  type Schema,
} from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { IMAGE_NODE } from "../core/images";
import { BLOCK_ID_ATTRIBUTE, BLOCK_TYPES_WITH_ID } from "../core/schema";
import { CellSelection, isInTable } from "@tiptap/pm/tables";
import { convertPageBreaks } from "./pageBreakPaste";
import {
  addTableBordersForEmail,
  flattenNestedTables,
  flattenTablesForCell,
  splitMergedCells,
} from "./tablePaste";

/**
 * Attribut posé sur le HTML copié depuis Nano Buro, pour reconnaître un collage interne (critère 5),
 * y compris entre deux fenêtres. Sans effet dans une autre application.
 */
export const NANO_CLIPBOARD_ATTRIBUTE = "data-nano-buro";

/**
 * Vrai si le HTML du presse-papiers a été copié depuis Nano Buro : son premier bloc porte à la fois
 * la marque Nano Buro et celle de ProseMirror (`data-pm-slice`). Ce n'est pas une protection : un
 * collage reconnu à tort garde seulement sa mise en forme, que le schéma limite déjà.
 */
export function isNanoBuroHtml(html: string): boolean {
  if (!html.includes(NANO_CLIPBOARD_ATTRIBUTE)) return false;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.querySelector(`[${NANO_CLIPBOARD_ATTRIBUTE}][data-pm-slice]`) !== null;
}

/** Rendu HTML de la copie : celui du schéma, avec la marque Nano Buro sur chaque bloc copié. */
class NanoClipboardSerializer extends DOMSerializer {
  override serializeFragment(
    fragment: Fragment,
    options?: { document?: Document },
    target?: HTMLElement | DocumentFragment,
  ): HTMLElement | DocumentFragment {
    const result = super.serializeFragment(fragment, options, target);
    // Sans `target`, c'est l'appel de premier niveau : seuls les blocs copiés sont marqués,
    // pas leur contenu (le HTML reste celui du schéma pour les autres applications).
    if (!target) {
      for (const child of Array.from(result.children)) {
        child.setAttribute(NANO_CLIPBOARD_ATTRIBUTE, "");
      }
      addTableBordersForEmail(result);
    }
    return result;
  }
}

/** Niveau (1 à 9) et type d'un paragraphe de liste de Word, ou null pour un paragraphe ordinaire. */
function wordListItem(element: Element): { level: number; ordered: boolean } | null {
  const style = element.getAttribute("style") ?? "";
  const match = /mso-list:\s*l\d+\s+level(\d)/i.exec(style);
  if (element.tagName !== "P" || !match) return null;
  const marker = element.querySelector('[style*="mso-list:Ignore" i]')?.textContent ?? "";
  return { level: Number(match[1]), ordered: /^\s*[\p{L}\p{N}]{1,6}[.)]/u.test(marker) };
}

/**
 * Word ne copie pas ses listes en `<ul>` ou `<ol>`, mais en paragraphes marqués `mso-list`, dont la
 * puce ou le numéro est du texte (`mso-list:Ignore`). Les remplace par de vraies listes imbriquées,
 * pour garder la structure (critère 1). Les numéros sont ensuite recalculés par l'éditeur.
 */
function convertWordLists(body: HTMLElement): void {
  const doc = body.ownerDocument;
  const paragraphs = Array.from(body.querySelectorAll("p")).filter((p) => wordListItem(p));
  for (const first of paragraphs) {
    if (!first.isConnected || !wordListItem(first)) continue;
    const run: Element[] = [];
    for (
      let node: Element | null = first;
      node && wordListItem(node);
      node = node.nextElementSibling
    ) {
      run.push(node);
    }
    const stack: { level: number; list: HTMLElement; item: HTMLElement | null }[] = [];
    let root: HTMLElement | null = null;
    for (const paragraph of run) {
      const info = wordListItem(paragraph);
      if (!info) continue;
      paragraph
        .querySelectorAll('[style*="mso-list:Ignore" i]')
        .forEach((marker) => marker.remove());
      while (stack.length > 0 && (stack.at(-1)?.level ?? 0) > info.level) stack.pop();
      let top = stack.at(-1);
      if (!top || top.level < info.level) {
        const list = doc.createElement(info.ordered ? "ol" : "ul");
        if (top?.item) top.item.appendChild(list);
        else if (top) top.list.appendChild(list);
        else root = list;
        top = { level: info.level, list, item: null };
        stack.push(top);
      }
      const item = doc.createElement("li");
      const content = doc.createElement("p");
      content.append(...Array.from(paragraph.childNodes));
      item.appendChild(content);
      top.list.appendChild(item);
      top.item = item;
    }
    if (root) first.replaceWith(root);
    run.forEach((paragraph) => paragraph.remove());
  }
}

/**
 * Prépare le HTML d'un collage venu d'une autre application, avant sa lecture par le schéma :
 * listes de Word en vraies listes, tableaux imbriqués aplatis et cellules fusionnées séparées (T1.8),
 * sauts de page reconnus (T2.8). Le reste (styles,
 * images, scripts) est trié ensuite : ce que le schéma ne connaît pas est ignoré ou gardé comme
 * simple texte (critère 4). Les tableaux restent des tableaux (T1.8).
 */
export function prepareExternalHtml(html: string): string {
  const wordLists = /mso-list/i.test(html);
  const tables = /<table/i.test(html);
  const pageBreaks = /break-before/i.test(html);
  if (!wordLists && !tables && !pageBreaks) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (pageBreaks) convertPageBreaks(doc.body);
  if (wordLists) convertWordLists(doc.body);
  if (tables) {
    flattenNestedTables(doc.body);
    splitMergedCells(doc.body);
  }
  return doc.body.innerHTML;
}

/** Applique `transform` à chaque nœud d'un fragment, en profondeur. */
function mapFragment(
  fragment: Fragment,
  transform: (node: ProseMirrorNode) => ProseMirrorNode,
): Fragment {
  const nodes: ProseMirrorNode[] = [];
  fragment.forEach((child) => {
    const inner = child.isText ? child : child.copy(mapFragment(child.content, transform));
    nodes.push(transform(inner));
  });
  return Fragment.from(nodes);
}

/** Retire les images d'un fragment, à toute profondeur. */
function removeImages(fragment: Fragment): Fragment {
  const nodes: ProseMirrorNode[] = [];
  fragment.forEach((child) => {
    if (child.type.name === IMAGE_NODE) return;
    nodes.push(child.isLeaf ? child : child.copy(removeImages(child.content)));
  });
  return Fragment.from(nodes);
}

/**
 * Collage dans une cellule : les images sont retirées, car un tableau ne contient pas d'image
 * (T1.9, hors périmètre). Sans cela, ProseMirror couperait le tableau pour placer l'image.
 */
export function withoutImages(slice: Slice): Slice {
  let found = false;
  slice.content.descendants((node) => {
    if (node.type.name === IMAGE_NODE) found = true;
    return !found;
  });
  return found ? new Slice(removeImages(slice.content), slice.openStart, slice.openEnd) : slice;
}

/** Marques retirées d'un collage extérieur : police, taille et couleur ; surlignage (T1.7). */
const EXTERNAL_MARKS_REMOVED = ["textStyle", "highlight"];

/** Attributs d'une cellule collée de l'extérieur : sans fusion, largeur ni alignement propres. */
const EXTERNAL_CELL_ATTRS = { colspan: 1, rowspan: 1, colwidth: null, align: null };

/** Options du nettoyage d'un collage. */
export interface PasteCleaning {
  /** Vrai pour un collage copié depuis Nano Buro : toute la mise en forme est gardée (critère 5). */
  internal: boolean;
  /** Police et taille (sans couleur) autour du curseur, données au texte collé de l'extérieur (critère 2). */
  contextTextStyle: Mark | null;
  /** Vrai pour un collage : les blocs collés reçoivent de nouveaux identifiants (critère 8). */
  newBlockIds: boolean;
}

/**
 * Nettoie le contenu collé, déjà lu par le schéma.
 * - Toujours (collage) : retire les identifiants de bloc ; src/editor/blockIds.ts en donne de
 *   nouveaux, sans doublon (critère 8).
 * - Collage extérieur : retire polices, tailles, couleurs (marque `textStyle`) et surlignages
 *   (marque `highlight`, T1.7 critère 7), leur substitue la police et la taille du curseur, et retire
 *   l'alignement (critère 2), l'interligne (T2.2) et le retrait (T2.14), et la fusion, la largeur et l'alignement des cellules (T1.8). Les fonds
 *   n'existent pas dans le schéma : ils sont déjà ignorés.
 */
export function cleanPastedSlice(slice: Slice, options: PasteCleaning): Slice {
  const { internal, contextTextStyle, newBlockIds } = options;
  const content = mapFragment(slice.content, (node) => {
    if (node.isText) {
      if (internal) return node;
      const marks = node.marks.filter((mark) => !EXTERNAL_MARKS_REMOVED.includes(mark.type.name));
      return node.mark(contextTextStyle ? contextTextStyle.addToSet(marks) : marks);
    }
    const attrs = { ...node.attrs };
    if (newBlockIds && BLOCK_TYPES_WITH_ID.includes(node.type.name)) {
      attrs[BLOCK_ID_ATTRIBUTE] = null;
    }
    if (!internal && "textAlign" in attrs) attrs.textAlign = null;
    // Interligne retiré d'un collage extérieur, comme les autres mises en forme (T2.2, critère 6).
    if (!internal && "lineHeight" in attrs) attrs.lineHeight = null;
    // Retrait retiré d'un collage extérieur, comme l'interligne (T2.14, critère 3).
    if (!internal && "indent" in attrs) attrs.indent = null;
    // Cellule venue d'ailleurs : ni largeur de colonne ni alignement de cellule (T1.8, critère 5 et 7).
    if (!internal && "colwidth" in attrs) Object.assign(attrs, EXTERNAL_CELL_ATTRS);
    return node.type.create(attrs, node.content, node.marks);
  });
  return new Slice(content, slice.openStart, slice.openEnd);
}

/**
 * Police et taille au curseur, à donner au texte collé de l'extérieur. Sans la couleur : un collage
 * extérieur n'est jamais coloré, même dans un texte rouge (T1.7, critère 7).
 */
function contextTextStyleOf(view: EditorView): Mark | null {
  const { state } = view;
  const marks = state.storedMarks ?? state.selection.$from.marks();
  const mark = marks.find((candidate) => candidate.type.name === "textStyle");
  if (!mark) return null;
  const attrs = { ...mark.attrs, color: null };
  return Object.values(attrs).some((value) => value !== null) ? mark.type.create(attrs) : null;
}

/**
 * Plugin du copier-coller. Le collage interne est reconnu à la marque posée par la copie ; un
 * glisser-déposer dans le document est aussi interne, et garde ses identifiants (c'est un déplacement).
 * Ctrl/Cmd+Shift+V colle du texte brut : ProseMirror le reconnaît seul (touche Maj enfoncée),
 * comme Chrome et Edge, et garde un paragraphe par ligne (critère 3).
 */
export function createClipboardPlugin(schema: Schema): Plugin {
  const base = DOMSerializer.fromSchema(schema);
  const serializer = new NanoClipboardSerializer(base.nodes, base.marks);
  let pastedFromNanoBuro = false;
  return new Plugin({
    key: new PluginKey("cleanClipboard"),
    props: {
      clipboardSerializer: serializer,
      transformPastedHTML(html) {
        pastedFromNanoBuro = isNanoBuroHtml(html);
        return pastedFromNanoBuro ? html : prepareExternalHtml(html);
      },
      transformPasted(slice, view) {
        const dragging = view.dragging !== null;
        const internal = pastedFromNanoBuro || dragging;
        pastedFromNanoBuro = false;
        const { selection } = view.state;
        const inCell = !(selection instanceof CellSelection) && isInTable(view.state);
        return cleanPastedSlice(inCell ? withoutImages(flattenTablesForCell(slice)) : slice, {
          internal,
          contextTextStyle: contextTextStyleOf(view),
          newBlockIds: !dragging,
        });
      },
    },
  });
}

/** Extension Tiptap qui installe `createClipboardPlugin`. */
export const CleanClipboard = Extension.create({
  name: "cleanClipboard",
  addProseMirrorPlugins() {
    return [createClipboardPlugin(this.editor.schema)];
  },
});
