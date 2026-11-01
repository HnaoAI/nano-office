// Ouverture d'un fichier Word (T2.18) : regroupement des blocs lus par wordImportBlocks.ts en listes à niveaux
// (T1.2), encadrés (T2.19) et tableaux (T1.8), titre du sommaire retiré, identifiants de bloc neufs (règle
// produit 5). Logique pure.
import { BLOCK_ID_ATTRIBUTE, BLOCK_TYPES_WITH_ID, MAX_LIST_DEPTH } from "./schema";
import { TOC_NODE } from "./tocSchema";
import type { DocumentJson } from "./types";
import type { BlockContext, Item, TableCellItems } from "./wordImportBlocks";

/** Marge de gauche, en vingtièmes de point, d'un niveau de liste de l'export Word (T2.7) : 0,25 pouce. */
const LIST_INDENT = 360;

/** Liste vide d'un type. */
function newList(ordered: boolean, start = 1): DocumentJson {
  return ordered
    ? { type: "orderedList", attrs: start !== 1 ? { start } : {}, content: [] }
    : { type: "bulletList", content: [] };
}

/** Dernier élément d'une liste, créé avec un paragraphe vide s'il n'y en a pas (niveau sauté dans Word). */
function lastItem(list: DocumentJson): DocumentJson {
  const content = (list.content ??= []);
  let item = content[content.length - 1];
  if (!item) {
    item = { type: "listItem", content: [{ type: "paragraph" }] };
    content.push(item);
  }
  return item;
}

/** Paragraphe d'un élément de liste : sans retrait, la liste a le sien. */
function listParagraph(node: DocumentJson): DocumentJson {
  return { ...node, type: "paragraph", attrs: { ...node.attrs, indent: null, level: undefined } };
}

/**
 * Construit une liste à partir de `items[start]` : éléments qui se suivent dans la même liste de Word, niveaux
 * imbriqués (trois au plus, T1.2), et paragraphes de suite d'un élément, reconnus à leur marge (ceux de l'export
 * Word de Nano Buro, T2.7). Une liste numérotée reprise après un autre bloc continue sa numérotation, comme dans Word.
 * @returns la liste et l'indice du premier bloc qui n'en fait pas partie
 */
function buildList(items: Item[], start: number, context: BlockContext): [DocumentJson, number] {
  const first = items[start];
  if (first?.kind !== "text" || !first.list) throw new Error("pas une liste");
  const root = first.list;
  const base = root.level;
  const done = context.listCounts.get(root.numId) ?? 0;
  const stack = [{ list: newList(root.ordered, root.ordered ? root.start + done : 1), level: 0 }];
  const top = () => stack[stack.length - 1] as { list: DocumentJson; level: number };
  let index = start;
  for (; index < items.length; index++) {
    const item = items[index];
    if (item?.kind !== "text" || item.callout !== first.callout) break;
    if (!item.list) {
      // Paragraphe de suite d'un élément : aligné sur le texte d'un niveau ouvert.
      const level = item.indentLeft !== null ? item.indentLeft / LIST_INDENT - 1 : -1;
      if (
        item.node.type !== "paragraph" ||
        !Number.isInteger(level) ||
        level < 0 ||
        level > top().level
      )
        break;
      while (top().level > level) stack.pop();
      lastItem(top().list).content?.push(listParagraph(item.node));
      continue;
    }
    const level = Math.min(Math.max(item.list.level - base, 0), MAX_LIST_DEPTH - 1);
    const type = item.list.ordered ? "orderedList" : "bulletList";
    if (
      level === 0 &&
      index > start &&
      (item.list.numId !== root.numId || type !== stack[0]?.list.type)
    )
      break;
    while (top().level > level) stack.pop();
    while (top().level < level) {
      const nested = newList(item.list.ordered, top().level + 1 === level ? item.list.start : 1);
      lastItem(top().list).content?.push(nested);
      stack.push({ list: nested, level: top().level + 1 });
    }
    if (top().list.type !== type && level > 0) {
      // Autre type de liste au même niveau : une nouvelle liste dans l'élément parent.
      stack.pop();
      const nested = newList(item.list.ordered, item.list.start);
      lastItem(top().list).content?.push(nested);
      stack.push({ list: nested, level });
    }
    top().list.content?.push({ type: "listItem", content: [listParagraph(item.node)] });
    if (level === 0)
      context.listCounts.set(root.numId, (context.listCounts.get(root.numId) ?? 0) + 1);
  }
  return [stack[0]?.list as DocumentJson, index];
}

/** Retire le gras d'un texte : une cellule d'en-tête est déjà en gras (T1.8), comme dans l'export Word (T2.7). */
function withoutBold(node: DocumentJson): DocumentJson {
  const marks = node.marks?.filter((mark) => mark.type !== "bold");
  return {
    ...node,
    ...(node.marks ? { marks: marks && marks.length > 0 ? marks : undefined } : {}),
    ...(node.content ? { content: node.content.map(withoutBold) } : {}),
  };
}

/** Tableau à partir de ses cellules lues, avec les listes de chaque cellule regroupées. */
function tableNode(rows: TableCellItems[][], context: BlockContext): DocumentJson {
  return {
    type: "table",
    content: rows.map((cells) => ({
      type: "tableRow",
      content: cells.map((cell) => {
        const content = groupLists(cell.items, context);
        return {
          type: cell.header ? "tableHeader" : "tableCell",
          content:
            content.length === 0
              ? [{ type: "paragraph" }]
              : cell.header
                ? content.map(withoutBold)
                : content,
        };
      }),
    })),
  };
}

/** Bloc d'un élément lu, hors liste. */
function nodeOf(item: Item, context: BlockContext): DocumentJson {
  switch (item.kind) {
    case "text":
    case "image":
      return item.node;
    case "pageBreak":
      return { type: "pageBreak" };
    case "toc":
      return { type: TOC_NODE };
    case "table":
      return tableNode(item.rows, context);
  }
}

/** Regroupe les éléments de liste qui se suivent en listes ; les autres blocs restent tels quels. */
function groupLists(items: Item[], context: BlockContext): DocumentJson[] {
  const blocks: DocumentJson[] = [];
  let index = 0;
  while (index < items.length) {
    const item = items[index] as Item;
    if (item.kind === "text" && item.list) {
      const [list, next] = buildList(items, index, context);
      blocks.push(list);
      index = next;
    } else {
      blocks.push(nodeOf(item, context));
      index++;
    }
  }
  return blocks;
}

/** Style d'encadré d'un élément, ou null. */
function calloutOfItem(item: Item): string | null {
  return item.kind === "text" || item.kind === "image" ? item.callout : null;
}

/**
 * Blocs du document : le titre d'un sommaire de Word est retiré (celui de Nano Buro a le sien, T2.17), les
 * paragraphes à bordure ou à fond qui se suivent forment un encadré (T2.19), et les listes sont regroupées.
 */
export function groupBlocks(items: Item[], context: BlockContext): DocumentJson[] {
  const kept = items.filter(
    (item, index) => !(item.kind === "text" && item.tocHeading && items[index + 1]?.kind === "toc"),
  );
  const blocks: DocumentJson[] = [];
  let index = 0;
  while (index < kept.length) {
    const style = calloutOfItem(kept[index] as Item);
    let end = index + 1;
    if (style !== null) {
      while (end < kept.length && calloutOfItem(kept[end] as Item) === style) end++;
      blocks.push({
        type: "callout",
        attrs: { calloutStyle: style },
        content: groupLists(kept.slice(index, end), context),
      });
    } else {
      while (end < kept.length && calloutOfItem(kept[end] as Item) === null) end++;
      blocks.push(...groupLists(kept.slice(index, end), context));
    }
    index = end;
  }
  return blocks;
}

/**
 * Donne un identifiant neuf à chaque bloc qui en porte un (règle produit 5, critère 6) et retire les attributs vides.
 * @param generateId fabrique un identifiant (UUID version 4 par défaut)
 */
export function withBlockIds(
  node: DocumentJson,
  generateId: () => string = () => crypto.randomUUID(),
): DocumentJson {
  const attrs = Object.fromEntries(
    Object.entries(node.attrs ?? {}).filter(([, value]) => value !== null && value !== undefined),
  );
  if (BLOCK_TYPES_WITH_ID.includes(node.type)) attrs[BLOCK_ID_ATTRIBUTE] = generateId();
  return {
    ...node,
    ...(Object.keys(attrs).length > 0 ? { attrs } : { attrs: undefined }),
    ...(node.content
      ? { content: node.content.map((child) => withBlockIds(child, generateId)) }
      : {}),
  };
}
