// Ouverture d'un fichier Word (T2.18) : corps du document de Word (`w:body`) converti en blocs de Nano Buro
// (JSON de Tiptap) : paragraphes, titres, texte mis en forme, liens, images, sauts de page, tableaux, sommaire,
// puis listes et encadrés regroupés par wordImportGroups.ts. Logique pure ; styles et propriétés dans
// wordImportStyles.ts, XML dans wordXml.ts.
import { calloutStyle, type CalloutStyle } from "./calloutSchema";
import { detectImageType } from "./images";
import { isAllowedLinkUrl, LINK_COLOR } from "./links";
import type { DocumentJson } from "./types";
import {
  alignmentOf,
  fontSizeOf,
  headingLevelOf,
  indentOf,
  isTocHeadingStyle,
  lineHeightOf,
  listFormat,
  nearestFont,
  nearestHighlight,
  nearestTextColor,
  paragraphProps,
  runProps,
  type ParagraphProps,
  type RunProps,
  type WordStyles,
} from "./wordImportStyles";
import {
  childElements,
  descendants,
  hasDescendant,
  intAttr,
  isW,
  rAttr,
  wAttr,
  wChild,
  wChildren,
  wVal,
} from "./wordXml";

/**
 * Éléments d'un fichier Word qui n'ont pas pu être repris, ou seulement en partie (critère 3), signalés dans
 * le message affiché à l'ouverture.
 */
export type WordSkipped =
  | "comments"
  | "textBoxes"
  | "shapes"
  | "footnotes"
  | "headerFooter"
  | "fields"
  | "equations"
  | "unsupportedImages"
  | "mergedCells"
  | "nestedTables"
  | "tableImages";

/** Relation d'un fichier de l'archive : sa cible, et vrai si elle est hors de l'archive (lien web). */
export interface WordRelationship {
  type: string;
  target: string;
  external: boolean;
}

/** Champ de Word en cours de lecture (`w:fldChar`) : son code, puis son résultat affiché. */
interface Field {
  code: string;
  phase: "code" | "result";
  kind: "link" | "toc" | "other";
  href: string | null;
}

/** État d'une conversion. */
export interface BlockContext {
  styles: WordStyles;
  rels: ReadonlyMap<string, WordRelationship>;
  /** Contenu des images de l'archive, par identifiant de relation. */
  media: ReadonlyMap<string, Uint8Array>;
  /** Images utilisées, par clé provisoire (attribut `hash` du nœud image, remplacé par l'empreinte ensuite). */
  images: Map<string, Uint8Array>;
  skipped: Set<WordSkipped>;
  /** Vrai si le fichier contient un suivi des modifications, lu dans son état final (critère 3). */
  trackedChanges: boolean;
  fields: Field[];
  /** Nombre d'éléments de premier niveau déjà écrits pour chaque liste de Word, pour continuer sa numérotation. */
  listCounts: Map<string, number>;
  /** Clé provisoire de chaque image déjà lue, par identifiant de relation : une image répétée n'est rangée qu'une fois. */
  imageKeys: Map<string, string>;
}

/** Liste de Word d'un paragraphe : son numéro, son niveau (0 à 2) et son type. */
export interface ListRef {
  numId: string;
  level: number;
  ordered: boolean;
}

/** Bloc lu, avant le regroupement des listes et des encadrés (wordImportGroups.ts). */
export type Item =
  | {
      kind: "text";
      node: DocumentJson;
      list: ListRef | null;
      callout: CalloutStyle | null;
      /** Marge de gauche en vingtièmes de point, pour reconnaître un paragraphe de suite d'un élément de liste. */
      indentLeft: number | null;
      /** Vrai pour le titre d'un sommaire de Word (« Table des matières »), retiré devant le sommaire. */
      tocHeading: boolean;
    }
  | { kind: "image"; node: DocumentJson; callout: CalloutStyle | null }
  | { kind: "pageBreak" }
  | { kind: "toc" }
  | { kind: "table"; rows: TableCellItems[][] };

/** Cellule de tableau lue : ses blocs (paragraphes seulement), et vrai pour une cellule de la ligne d'en-tête. */
export interface TableCellItems {
  header: boolean;
  items: Item[];
}

/** Morceau d'un paragraphe : du texte, une image, un saut de page, un retour à la ligne ou le sommaire. */
type Piece =
  | { kind: "text"; text: string; marks: NonNullable<DocumentJson["marks"]> }
  | { kind: "image"; node: DocumentJson }
  | { kind: "pageBreak" }
  | { kind: "lineBreak" }
  | { kind: "toc" };

/** Espace de noms des équations de Word (`m:`). */
const MATH_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/math";

/** Pixels (96 par pouce) d'une longueur en EMU de Word (914 400 par pouce). */
const EMU_PER_PX = 9525;

/** Titres de sommaire reconnus devant un sommaire, retirés car le sommaire de Nano Buro a le sien. */
const TOC_TITLES = /^(sommaire|table des matières|contents|table of contents)$/i;

/** Lien de Word (`w:hyperlink`) : adresse web acceptée (T2.12), ou null pour un renvoi dans le document. */
function hyperlinkHref(element: Element, context: BlockContext): string | null {
  const id = rAttr(element, "id");
  const rel = id ? context.rels.get(id) : undefined;
  return rel?.external && isAllowedLinkUrl(rel.target) ? rel.target : null;
}

/** Adresse d'un champ `HYPERLINK "https://…"` (sans `\l`, qui renvoie dans le document), ou null. */
function fieldHref(code: string): string | null {
  if (/\\l\b/.test(code)) return null;
  const match = /HYPERLINK\s+"([^"]+)"/i.exec(code) ?? /HYPERLINK\s+(\S+)/i.exec(code);
  const href = match?.[1] ?? null;
  return isAllowedLinkUrl(href) ? href : null;
}

/** Sorte d'un champ d'après son code : lien, sommaire, ou autre (date, numéro de page, renvoi…). */
function fieldKind(code: string): Field["kind"] {
  const name = /^\s*(\w+)/.exec(code)?.[1]?.toUpperCase();
  return name === "HYPERLINK" ? "link" : name === "TOC" ? "toc" : "other";
}

/** Marques de Nano Buro d'un morceau de texte de Word. */
function marksOf(props: RunProps, href: string | null): NonNullable<DocumentJson["marks"]> {
  const marks: NonNullable<DocumentJson["marks"]> = [];
  if (props.bold) marks.push({ type: "bold" });
  if (props.italic) marks.push({ type: "italic" });
  // Dans un lien, le soulignement et le bleu viennent du lien lui-même (T2.12) : l'export Word les écrit.
  if (props.underline && !href) marks.push({ type: "underline" });
  if (props.strike) marks.push({ type: "strike" });
  if (props.vertAlign === "superscript") marks.push({ type: "superscript" });
  if (props.vertAlign === "subscript") marks.push({ type: "subscript" });
  if (href) marks.push({ type: "link", attrs: { href } });
  const color = nearestTextColor(props.color);
  const style = {
    fontFamily: nearestFont(props.font),
    fontSize: fontSizeOf(props.size),
    color: href && color === LINK_COLOR ? null : color,
  };
  if (style.fontFamily || style.fontSize || style.color) {
    marks.push({ type: "textStyle", attrs: style });
  }
  const highlight = nearestHighlight(props);
  if (highlight) marks.push({ type: "highlight", attrs: { color: highlight } });
  return marks;
}

/** État de lecture d'un paragraphe. */
interface ParagraphState {
  props: ParagraphProps;
  heading: boolean;
  align: string | null;
  pieces: Piece[];
  /** Vrai si une partie du paragraphe appartient à un sommaire de Word. */
  touchedToc: boolean;
  inTable: boolean;
}

/** Vrai si le texte est caché par un champ (son code) ou par le sommaire de Word (son résultat, remplacé). */
function hiddenByField(context: BlockContext): boolean {
  return context.fields.some((field) => field.phase === "code" || field.kind === "toc");
}

/** Adresse du lien de champ en cours, ou null. */
function fieldLink(context: BlockContext): string | null {
  for (let index = context.fields.length - 1; index >= 0; index--) {
    const field = context.fields[index];
    if (field?.kind === "link" && field.phase === "result") return field.href;
  }
  return null;
}

/** Image d'un dessin de Word (`w:drawing`), ou null avec la raison signalée (zone de texte, forme, format). */
function drawingImage(
  drawing: Element,
  state: ParagraphState,
  context: BlockContext,
): DocumentJson | null {
  if (hasDescendant(drawing, "txbx") || hasDescendant(drawing, "textbox")) {
    context.skipped.add("textBoxes");
  }
  const blip = descendants(drawing, "blip")[0];
  if (!blip) {
    if (!hasDescendant(drawing, "txbx")) context.skipped.add("shapes");
    return null;
  }
  const extent = descendants(drawing, "extent")[0];
  const cx = intAttr(extent?.getAttribute("cx") ?? null);
  const docPr = descendants(drawing, "docPr")[0];
  const alt = docPr?.getAttribute("descr") || docPr?.getAttribute("title") || "";
  return imageNode(rAttr(blip, "embed"), cx === null ? null : cx / EMU_PER_PX, alt, state, context);
}

/** Image d'un ancien dessin de Word (`w:pict`, VML), ou null avec la raison signalée. */
function pictImage(
  pict: Element,
  state: ParagraphState,
  context: BlockContext,
): DocumentJson | null {
  const data = descendants(pict, "imagedata")[0];
  if (!data) {
    context.skipped.add(hasDescendant(pict, "textbox") ? "textBoxes" : "shapes");
    return null;
  }
  const shape = descendants(pict, "shape")[0];
  const width = /width:\s*([\d.]+)pt/.exec(shape?.getAttribute("style") ?? "")?.[1];
  const alt = shape?.getAttribute("alt") ?? "";
  return imageNode(
    rAttr(data, "id"),
    width ? (Number(width) * 96) / 72 : null,
    alt,
    state,
    context,
  );
}

/**
 * Nœud image avec une clé provisoire. Une image d'un format que le navigateur n'affiche pas (EMF, WMF, TIFF…)
 * est signalée et laissée de côté.
 */
function imageNode(
  rId: string | null,
  widthPx: number | null,
  alt: string,
  state: ParagraphState,
  context: BlockContext,
): DocumentJson | null {
  const data = rId ? context.media.get(rId) : undefined;
  if (!rId || !data || detectImageType(data) === null) {
    context.skipped.add("unsupportedImages");
    return null;
  }
  let key = context.imageKeys.get(rId);
  if (!key) {
    key = `word-image-${String(context.imageKeys.size + 1)}`;
    context.imageKeys.set(rId, key);
    context.images.set(key, data);
  }
  const width = widthPx !== null && widthPx >= 1 ? Math.round(widthPx) : null;
  return {
    type: "image",
    attrs: { hash: key, alt, width, textAlign: alignmentOf(state.align) },
  };
}

/** Lit un champ de Word (`w:fldChar`) : début, séparation entre code et résultat, fin. */
function readFieldChar(element: Element, state: ParagraphState, context: BlockContext): void {
  const type = wAttr(element, "fldCharType");
  if (type === "begin") {
    context.fields.push({ code: "", phase: "code", kind: "other", href: null });
    return;
  }
  const field = context.fields[context.fields.length - 1];
  if (!field) return;
  if (type === "separate" && field.phase === "code") startFieldResult(field, state, context);
  if (type === "end") {
    if (field.phase === "code") startFieldResult(field, state, context);
    if (field.kind === "toc") state.touchedToc = true;
    context.fields.pop();
  }
}

/** Passe un champ de son code à son résultat : un sommaire de Word devient celui de Nano Buro (T2.17). */
function startFieldResult(field: Field, state: ParagraphState, context: BlockContext): void {
  field.phase = "result";
  field.kind = fieldKind(field.code);
  field.href = field.kind === "link" ? fieldHref(field.code) : null;
  const insideToc = context.fields.some((other) => other !== field && other.kind === "toc");
  if (field.kind === "toc" && !insideToc) {
    state.pieces.push({ kind: "toc" });
    state.touchedToc = true;
  }
  // Les autres champs (date, numéro de page, renvoi…) gardent le texte affiché par Word, mais ne se mettent plus à jour.
  if (field.kind === "other" && !insideToc) context.skipped.add("fields");
}

/** Ajoute du texte au paragraphe, sauf s'il est caché par un champ. */
function pushText(
  text: string,
  props: RunProps,
  href: string | null,
  state: ParagraphState,
  context: BlockContext,
) {
  if (text === "" || props.hidden) return;
  if (hiddenByField(context)) {
    if (context.fields.some((field) => field.kind === "toc")) state.touchedToc = true;
    return;
  }
  state.pieces.push({
    kind: "text",
    text: props.caps ? text.toLocaleUpperCase("fr") : text,
    marks: marksOf(props, href ?? fieldLink(context)),
  });
}

/** Lit un morceau de texte de Word (`w:r`). */
function readRun(
  run: Element,
  href: string | null,
  state: ParagraphState,
  context: BlockContext,
): void {
  const props = runProps(context.styles, state.props, state.heading, wChild(run, "rPr"));
  readRunContent(childElements(run), props, href, state, context);
}

/** Lit le contenu d'un morceau de texte : texte, tabulations, retours, images, champs, renvois. */
function readRunContent(
  elements: Element[],
  props: RunProps,
  href: string | null,
  state: ParagraphState,
  context: BlockContext,
): void {
  for (const element of elements) {
    if (element.localName === "AlternateContent") {
      // Contenu de remplacement : le premier choix suffit, le second est la même chose pour un ancien Word.
      const choice = Array.from(element.children).find((child) => child.localName === "Choice");
      if (choice) readRunContent(childElements(choice), props, href, state, context);
      continue;
    }
    if (isW(element, "t")) pushText(element.textContent ?? "", props, href, state, context);
    else if (isW(element, "tab") || isW(element, "ptab"))
      pushText("\t", props, href, state, context);
    else if (isW(element, "noBreakHyphen")) pushText("‑", props, href, state, context);
    else if (isW(element, "br") || isW(element, "cr")) {
      if (hiddenByField(context) || props.hidden) continue;
      const type = wAttr(element, "type");
      if (type === "page") state.pieces.push({ kind: "pageBreak" });
      else if (type !== "column") state.pieces.push({ kind: "lineBreak" });
    } else if (isW(element, "drawing") || isW(element, "pict")) {
      if (hiddenByField(context)) continue;
      const node = isW(element, "drawing")
        ? drawingImage(element, state, context)
        : pictImage(element, state, context);
      if (node) state.pieces.push({ kind: "image", node });
    } else if (isW(element, "object")) context.skipped.add("shapes");
    else if (isW(element, "fldChar")) readFieldChar(element, state, context);
    else if (isW(element, "instrText")) {
      const field = context.fields[context.fields.length - 1];
      if (field?.phase === "code") field.code += element.textContent ?? "";
    } else if (isW(element, "footnoteReference") || isW(element, "endnoteReference")) {
      context.skipped.add("footnotes");
    } else if (isW(element, "commentReference")) context.skipped.add("comments");
  }
}

/** Lit le contenu d'un paragraphe : morceaux de texte, liens, insertions et suppressions suivies, champs simples. */
function readInline(
  elements: Element[],
  href: string | null,
  state: ParagraphState,
  context: BlockContext,
): void {
  for (const element of elements) {
    if (element.namespaceURI === MATH_NAMESPACE) {
      context.skipped.add("equations");
      continue;
    }
    if (isW(element, "r")) readRun(element, href, state, context);
    else if (isW(element, "hyperlink")) {
      readInline(childElements(element), hyperlinkHref(element, context) ?? href, state, context);
    } else if (isW(element, "ins") || isW(element, "moveTo")) {
      // Suivi des modifications : lu dans son état final, modifications acceptées (critère 3).
      context.trackedChanges = true;
      readInline(childElements(element), href, state, context);
    } else if (isW(element, "del") || isW(element, "moveFrom")) {
      context.trackedChanges = true;
    } else if (isW(element, "fldSimple")) {
      const code = wAttr(element, "instr") ?? "";
      const kind = fieldKind(code);
      if (kind === "toc") {
        state.pieces.push({ kind: "toc" });
        state.touchedToc = true;
        continue;
      }
      if (kind === "other") context.skipped.add("fields");
      readInline(
        childElements(element),
        kind === "link" ? (fieldHref(code) ?? href) : href,
        state,
        context,
      );
    } else if (isW(element, "sdt")) {
      readInline(childElements(wChild(element, "sdtContent") ?? element), href, state, context);
    } else if (
      isW(element, "smartTag") ||
      isW(element, "customXml") ||
      isW(element, "dir") ||
      isW(element, "bdo")
    ) {
      readInline(childElements(element), href, state, context);
    } else if (isW(element, "commentRangeStart")) context.skipped.add("comments");
    else if (element.localName === "AlternateContent") {
      const choice = Array.from(element.children).find((child) => child.localName === "Choice");
      if (choice) readInline(childElements(choice), href, state, context);
    }
  }
}

/** Texte d'un paragraphe : morceaux qui se suivent avec les mêmes marques réunis, comme ProseMirror. */
function textNodes(pieces: Piece[]): DocumentJson[] {
  const nodes: DocumentJson[] = [];
  for (const piece of pieces) {
    if (piece.kind !== "text") continue;
    const last = nodes[nodes.length - 1];
    if (last && JSON.stringify(last.marks ?? []) === JSON.stringify(piece.marks)) {
      last.text = `${last.text ?? ""}${piece.text}`;
    } else {
      nodes.push({
        type: "text",
        text: piece.text,
        ...(piece.marks.length > 0 ? { marks: piece.marks } : {}),
      });
    }
  }
  return nodes;
}

/** Style d'encadré d'un paragraphe à bordure ou à fond (T2.19), ou null. */
function calloutOf(props: ParagraphProps): CalloutStyle | null {
  if (!props.border && !props.shading) return null;
  if (!props.border) return "shaded";
  const border = props.border.replace(/^#/, "").toUpperCase();
  if (props.shading && border === props.shading.replace(/^#/, "")) return "shaded";
  return calloutStyle(props.shading ? "border-shaded" : "border");
}

/**
 * Convertit un paragraphe de Word (`w:p`) en blocs : un paragraphe ou un titre, coupé par ses retours à la ligne,
 * ses images et ses sauts de page, qui deviennent des blocs à part (une image est un bloc dans Nano Buro).
 * @param inTable vrai dans une cellule : ni encadré, ni saut de page
 */
export function paragraphItems(
  paragraph: Element,
  context: BlockContext,
  inTable: boolean,
): Item[] {
  const pPr = wChild(paragraph, "pPr");
  const styles = context.styles;
  const props = paragraphProps(styles, pPr, (ids) => headingLevelOf(styles, ids) > 0);
  const level = headingLevelOf(styles, props.styleIds);
  const state: ParagraphState = {
    props,
    heading: level > 0,
    align: props.align,
    pieces: [],
    touchedToc: context.fields.some((field) => field.kind === "toc"),
    inTable,
  };
  readInline(childElements(paragraph), null, state, context);
  if (wChild(wChild(pPr, "rPr"), "ins") || wChild(wChild(pPr, "rPr"), "del"))
    context.trackedChanges = true;
  if (
    wChild(pPr, "pPrChange") ||
    wChild(pPr, "sectPr")?.getElementsByTagNameNS("*", "sectPrChange").length
  ) {
    context.trackedChanges = true;
  }

  const format =
    level === 0 && props.numId && props.numId !== "0"
      ? listFormat(styles, props.numId, props.ilvl)
      : null;
  const list: ListRef | null =
    format && format !== "none" && props.numId
      ? {
          numId: props.numId,
          level: Math.min(Math.max(props.ilvl, 0), 2),
          ordered: format !== "bullet",
        }
      : null;
  const callout = inTable ? null : calloutOf(props);
  const attrs: Record<string, unknown> = {
    textAlign: alignmentOf(props.align),
    lineHeight: lineHeightOf(props.line, props.lineRule),
    indent: list ? null : indentOf(props.indentLeft) || null,
  };
  if (level > 0) attrs.level = level;
  const text = (content: DocumentJson[]): Item => ({
    kind: "text",
    node: {
      type: level > 0 ? "heading" : "paragraph",
      attrs: { ...attrs },
      ...(content.length ? { content } : {}),
    },
    list,
    callout,
    indentLeft: props.indentLeft,
    tocHeading:
      isTocHeadingStyle(styles, props.styleIds) ||
      TOC_TITLES.test(
        content
          .map((node) => node.text ?? "")
          .join("")
          .trim(),
      ),
  });

  const items: Item[] = [];
  if (props.pageBreakBefore && !inTable) items.push({ kind: "pageBreak" });
  const hasBlocks = state.pieces.some(
    (piece) => piece.kind !== "text" && piece.kind !== "lineBreak",
  );
  let segment: Piece[] = [];
  let afterLineBreak = false;
  // Une ligne vide de Word est voulue et gardée ; le reste d'un paragraphe qui ne contenait qu'une image, un saut de
  // page ou une partie du sommaire de Word, non.
  const flush = (beforeLineBreak: boolean) => {
    const content = textNodes(segment);
    const lone = !hasBlocks && !state.touchedToc;
    if (content.length > 0 || afterLineBreak || beforeLineBreak || lone) items.push(text(content));
    segment = [];
  };
  for (const piece of state.pieces) {
    if (piece.kind === "text") {
      segment.push(piece);
    } else if (piece.kind === "lineBreak") {
      // Nano Buro n'a pas de retour à la ligne dans un paragraphe : la ligne suivante devient un paragraphe.
      flush(true);
      afterLineBreak = true;
    } else {
      flush(false);
      afterLineBreak = false;
      if (piece.kind === "image") items.push({ kind: "image", node: piece.node, callout });
      else if (piece.kind === "pageBreak" && !inTable) items.push({ kind: "pageBreak" });
      else if (piece.kind === "toc" && !inTable) items.push({ kind: "toc" });
    }
  }
  flush(false);
  return items;
}

/**
 * Convertit un tableau de Word (`w:tbl`) : cellules fusionnées séparées, colonnes complétées, ligne d'en-tête
 * répétée devenue ligne d'en-tête (T1.8). Les images d'une cellule sont placées après le tableau, car une image
 * ne va jamais dans un tableau (T1.9), et un tableau imbriqué est mis à plat dans sa cellule. Les listes des
 * cellules sont regroupées ensuite, avec celles du document (wordImportGroups.ts).
 */
export function tableItems(table: Element, context: BlockContext): Item[] {
  const moved: Item[] = [];
  const rows: TableCellItems[][] = [];
  wChildren(table, "tr").forEach((row, rowIndex) => {
    const header = rowIndex === 0 && wChild(wChild(row, "trPr"), "tblHeader") !== null;
    const cells: TableCellItems[] = [];
    for (const cell of wChildren(row, "tc")) {
      const tcPr = wChild(cell, "tcPr");
      const span = Math.max(1, Math.min(intAttr(wVal(tcPr, "gridSpan")) ?? 1, 64));
      const vMerge = wChild(tcPr, "vMerge");
      if (vMerge && wAttr(vMerge, "val") !== "restart") {
        context.skipped.add("mergedCells");
        cells.push({ header, items: [] });
      } else {
        const items = blockItems(childElements(cell), context, true).filter((item) => {
          if (item.kind !== "image") return item.kind === "text";
          context.skipped.add("tableImages");
          moved.push({ ...item, callout: null });
          return false;
        });
        cells.push({ header, items });
      }
      if (span > 1) context.skipped.add("mergedCells");
      for (let extra = 1; extra < span; extra++) cells.push({ header, items: [] });
    }
    rows.push(cells);
  });
  const columns = Math.max(0, ...rows.map((cells) => cells.length));
  if (columns === 0) return moved;
  for (const cells of rows) {
    const header = cells[0]?.header ?? false;
    while (cells.length < columns) cells.push({ header, items: [] });
  }
  return [{ kind: "table", rows }, ...moved];
}

/**
 * Convertit une suite de blocs de Word : paragraphes, tableaux, contrôles de contenu (`w:sdt`), insertions suivies.
 * @param inTable vrai dans une cellule : un tableau imbriqué y est mis à plat (les tableaux ne s'imbriquent jamais)
 */
export function blockItems(elements: Element[], context: BlockContext, inTable: boolean): Item[] {
  const items: Item[] = [];
  for (const element of elements) {
    if (isW(element, "p")) items.push(...paragraphItems(element, context, inTable));
    else if (isW(element, "tbl")) {
      if (!inTable) {
        items.push(...tableItems(element, context));
        continue;
      }
      context.skipped.add("nestedTables");
      for (const row of wChildren(element, "tr")) {
        for (const cell of wChildren(row, "tc"))
          items.push(...blockItems(childElements(cell), context, true));
      }
    } else if (isW(element, "sdt")) {
      items.push(
        ...blockItems(childElements(wChild(element, "sdtContent") ?? element), context, inTable),
      );
    } else if (isW(element, "customXml") || isW(element, "ins") || isW(element, "moveTo")) {
      if (!isW(element, "customXml")) context.trackedChanges = true;
      items.push(...blockItems(childElements(element), context, inTable));
    } else if (isW(element, "del") || isW(element, "moveFrom")) {
      context.trackedChanges = true;
    } else if (isW(element, "altChunk")) context.skipped.add("shapes");
    else if (element.localName === "oMathPara" || element.namespaceURI === MATH_NAMESPACE) {
      context.skipped.add("equations");
    }
  }
  return items;
}
