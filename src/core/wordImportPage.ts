// Ouverture d'un fichier Word (T2.18) : mise en page de la section (ramenée à A4, orientation et marges, T2.5),
// et en-tête, pied de page et numéros de page simples (T2.15, T2.16). Un en-tête ou un pied de page plus riche
// (tableau, image, plusieurs lignes, autre champ) est signalé, et seul son premier texte est repris.
// Logique pure ; le XML est lu par wordXml.ts.
import {
  cleanMarginText,
  DEFAULT_HEADER_FOOTER,
  type HeaderFooter,
  type MarginTextAlign,
  type PageNumberPosition,
} from "./headerFooter";
import { MAX_MARGIN_CM, MIN_MARGIN_CM, type PageSetup } from "./pageSetup";
import { alignmentOf } from "./wordImportStyles";
import {
  childElements,
  descendants,
  intAttr,
  isW,
  wAttr,
  wChild,
  wChildren,
  wVal,
} from "./wordXml";

/** Centimètres d'une longueur de Word en vingtièmes de point (567 par centimètre). */
function cmOf(twips: number | null, fallback: number): number {
  if (twips === null) return fallback;
  const cm = Math.round((Math.abs(twips) * 2.54 * 100) / 1440) / 100;
  return Math.min(MAX_MARGIN_CM, Math.max(MIN_MARGIN_CM, cm));
}

/**
 * Mise en page de Nano Buro d'une section de Word (`w:sectPr`, critère 2) : toujours A4, en paysage si la page de
 * Word est plus large que haute, marges ramenées entre 0,5 et 5 cm.
 */
export function pageSetupOf(sectPr: Element | null): PageSetup {
  const size = wChild(sectPr, "pgSz");
  const width = intAttr(wAttr(size, "w"));
  const height = intAttr(wAttr(size, "h"));
  const landscape =
    wAttr(size, "orient") === "landscape" || (width !== null && height !== null && width > height);
  const margins = wChild(sectPr, "pgMar");
  const side = (name: string) => cmOf(intAttr(wAttr(margins, name)), 2.5);
  return {
    orientation: landscape ? "landscape" : "portrait",
    margins: { top: side("top"), bottom: side("bottom"), left: side("left"), right: side("right") },
  };
}

/** Un morceau d'une ligne d'en-tête : texte, numéro de page, ou tabulation qui passe à la zone suivante. */
type MarginPiece =
  { kind: "text"; text: string } | { kind: "page" } | { kind: "tab" } | { kind: "other" };

/** Lit les morceaux d'un paragraphe d'en-tête : texte, tabulations et champs (seul le numéro de page est compris). */
function marginPieces(
  elements: Element[],
  pieces: MarginPiece[],
  field: { code: string; state: string }[],
): void {
  for (const element of elements) {
    if (isW(element, "r")) {
      for (const child of childElements(element)) {
        const inCode = field.some((entry) => entry.state === "code");
        const inResult = field.length > 0;
        if (isW(child, "fldChar")) {
          const type = wAttr(child, "fldCharType");
          if (type === "begin") field.push({ code: "", state: "code" });
          const current = field[field.length - 1];
          if (current && (type === "separate" || type === "end") && current.state === "code") {
            current.state = "result";
            pieces.push(/^\s*PAGE\b/i.test(current.code) ? { kind: "page" } : { kind: "other" });
          }
          if (type === "end") field.pop();
        } else if (isW(child, "instrText")) {
          const current = field[field.length - 1];
          if (current) current.code += child.textContent ?? "";
        } else if (inCode || inResult) {
          continue;
        } else if (isW(child, "t")) pieces.push({ kind: "text", text: child.textContent ?? "" });
        else if (isW(child, "tab") || isW(child, "ptab")) pieces.push({ kind: "tab" });
        else if (isW(child, "drawing") || isW(child, "pict") || isW(child, "object"))
          pieces.push({ kind: "other" });
      }
    } else if (isW(element, "fldSimple")) {
      pieces.push(
        /^\s*PAGE\b/i.test(wAttr(element, "instr") ?? "") ? { kind: "page" } : { kind: "other" },
      );
    } else if (
      isW(element, "hyperlink") ||
      isW(element, "ins") ||
      isW(element, "smartTag") ||
      isW(element, "customXml")
    ) {
      marginPieces(childElements(element), pieces, field);
    } else if (isW(element, "sdt")) {
      marginPieces(childElements(wChild(element, "sdtContent") ?? element), pieces, field);
    }
  }
}

/** Contenu d'une zone : son texte et vrai si elle contient le numéro de page. */
interface Zone {
  text: string;
  page: boolean;
  other: boolean;
}

/** Zones (gauche, centre, droite) d'un en-tête ou d'un pied de page de Word, et vrai s'il est trop riche. */
interface MarginZones {
  zones: Partial<Record<MarginTextAlign, Zone>>;
  complex: boolean;
}

/** Séparateurs entre le texte d'un pied de page et le numéro (« Page 3 », « Famille – 3 »). */
const SEPARATORS = /[\s\-–—|·•:]+$/u;

/**
 * Zones d'un en-tête ou d'un pied de page de Word (`w:hdr`, `w:ftr`). Comme dans Word et dans l'export de Nano
 * Buro (T2.16), une ligne est découpée par ses tabulations : gauche, centre, droite. Sans tabulation, la zone suit
 * l'alignement du paragraphe.
 */
export function marginZones(root: Element | null): MarginZones {
  const result: MarginZones = { zones: {}, complex: false };
  if (!root) return result;
  if (wChildren(root, "tbl").length > 0 || descendants(root, "txbx").length > 0)
    result.complex = true;
  const lines = wChildren(root, "p").filter((paragraph) => {
    const pieces: MarginPiece[] = [];
    marginPieces(childElements(paragraph), pieces, []);
    return pieces.some(
      (piece) => piece.kind !== "tab" && (piece.kind !== "text" || piece.text.trim() !== ""),
    );
  });
  if (lines.length > 1) result.complex = true;
  const paragraph = lines[0];
  if (!paragraph) return result;
  const pieces: MarginPiece[] = [];
  marginPieces(childElements(paragraph), pieces, []);
  const tabs = pieces.filter((piece) => piece.kind === "tab").length;
  const jc = alignmentOf(wVal(wChild(paragraph, "pPr"), "jc"));
  const single: MarginTextAlign = jc === "center" || jc === "right" ? jc : "left";
  const order: MarginTextAlign[] =
    tabs === 0 ? [single] : tabs === 1 ? ["left", "center"] : ["left", "center", "right"];
  let zoneIndex = 0;
  for (const piece of pieces) {
    if (piece.kind === "tab") {
      zoneIndex = Math.min(zoneIndex + 1, order.length - 1);
      continue;
    }
    const align = order[zoneIndex] ?? "left";
    const zone = (result.zones[align] ??= { text: "", page: false, other: false });
    if (piece.kind === "text") zone.text += piece.text;
    else if (piece.kind === "page") zone.page = true;
    else zone.other = true;
  }
  const zones: MarginZones["zones"] = {};
  for (const [align, zone] of Object.entries(result.zones) as [MarginTextAlign, Zone][]) {
    zone.text = zone.page ? zone.text.replace(SEPARATORS, "").trim() : zone.text.trim();
    if (zone.other) result.complex = true;
    if (zone.text !== "" || zone.page) zones[align] = zone;
  }
  return { ...result, zones };
}

/** En-têtes et pieds de page d'une section : ceux des pages courantes, et ceux de la première page s'ils diffèrent. */
export interface SectionMargins {
  header: Element | null;
  footer: Element | null;
  /** Première page différente (`w:titlePg`) : ses en-tête et pied de page, vides s'ils n'existent pas. */
  first: { header: Element | null; footer: Element | null } | null;
  /** Vrai si la section a des en-têtes de pages paires différents, que Nano Buro n'a pas. */
  evenAndOdd: boolean;
}

/** Texte et alignement de la seule zone de texte, ou null ; plusieurs zones de texte rendent l'en-tête complexe. */
function singleText(
  zones: MarginZones["zones"],
  withPage: boolean,
): { text: string; align: MarginTextAlign; extra: boolean } | null {
  const texts = (Object.entries(zones) as [MarginTextAlign, Zone][]).filter(
    ([, zone]) => zone.text !== "" && (withPage || !zone.page),
  );
  const first = texts[0];
  return first ? { text: first[1].text, align: first[0], extra: texts.length > 1 } : null;
}

/**
 * En-tête, pied de page et numéros de page de Nano Buro (T2.15, T2.16) d'après ceux de Word. Le numéro de page
 * n'est repris qu'en bas, au centre ou à droite, comme dans Nano Buro ; ailleurs, l'en-tête est signalé complexe.
 * @returns les réglages, et vrai si une partie n'a pas pu être reprise
 */
export function headerFooterOf(margins: SectionMargins): {
  settings: HeaderFooter;
  complex: boolean;
} {
  const header = marginZones(margins.header);
  const footer = marginZones(margins.footer);
  let complex = header.complex || footer.complex || margins.evenAndOdd;
  const headerText = singleText(header.zones, true);
  if (headerText?.extra || Object.values(header.zones).some((zone) => zone.page)) complex = true;
  const pageZones = (Object.entries(footer.zones) as [MarginTextAlign, Zone][]).filter(
    ([, zone]) => zone.page,
  );
  const pageAlign = pageZones[0]?.[0];
  if (pageZones.length > 1 || pageAlign === "left") complex = true;
  const position: PageNumberPosition | null =
    pageAlign === "right" ? "right" : pageAlign ? "center" : null;
  const footerText = singleText(footer.zones, true);
  if (footerText?.extra) complex = true;

  const settings: HeaderFooter = {
    ...DEFAULT_HEADER_FOOTER,
    header: headerText
      ? { text: cleanMarginText(headerText.text), align: headerText.align }
      : DEFAULT_HEADER_FOOTER.header,
    footer: footerText
      ? { text: cleanMarginText(footerText.text), align: footerText.align }
      : DEFAULT_HEADER_FOOTER.footer,
    pageNumbers: position ? { position, skipFirst: false } : null,
  };
  if (margins.first) {
    const firstHeader = marginZones(margins.first.header);
    const firstFooter = marginZones(margins.first.footer);
    const firstTexts = [
      ...Object.values(firstHeader.zones),
      ...Object.values(firstFooter.zones),
    ].some((zone) => zone.text !== "");
    const firstPage = Object.values(firstFooter.zones).some((zone) => zone.page);
    settings.skipFirst = !firstTexts && (headerText !== null || footerText !== null);
    if (settings.pageNumbers) settings.pageNumbers.skipFirst = !firstPage;
  }
  return { settings, complex };
}
