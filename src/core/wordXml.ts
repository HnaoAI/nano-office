// Lecture du XML d'un fichier Word (T2.18) : espaces de noms, enfants, attributs et propriétés à bascule.
// Logique pure sur l'interface standard `Element` ; le texte XML est analysé par un `XmlParser` fourni par
// l'appelant (`DOMParser` du navigateur, celui de jsdom dans les tests), car src/core/ n'accède pas au navigateur.

/** Analyse un texte XML. Doit lever une exception, ou renvoyer un document `parsererror`, s'il est abîmé. */
export type XmlParser = (xml: string) => Document;

/** Espace de noms principal de Word (`w:`), et celui de la variante « Strict » de l'OOXML. */
const W_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  "http://purl.oclc.org/ooxml/wordprocessingml/main",
]);

/** Relations (`r:id`, `r:embed`), dans les deux variantes de l'OOXML. */
const R_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  "http://purl.oclc.org/ooxml/officeDocument/relationships",
]);

/**
 * Analyse un fichier XML de l'archive. Un `DOCTYPE` est refusé : Word n'en écrit jamais, et il permettrait
 * des entités qui gonflent sans fin.
 * @throws si le XML est abîmé
 */
export function parseXml(parser: XmlParser, xml: string): Element {
  if (/<!DOCTYPE/i.test(xml)) throw new Error("DOCTYPE refusé");
  const document = parser(xml);
  const root = document.documentElement;
  if (
    !root ||
    root.localName === "parsererror" ||
    document.getElementsByTagName("parsererror").length > 0
  ) {
    throw new Error("XML abîmé");
  }
  return root;
}

/** Vrai si l'élément est `w:<name>`. */
export function isW(element: Element, name: string): boolean {
  return element.localName === name && W_NAMESPACES.has(element.namespaceURI ?? "");
}

/** Enfants directs de l'élément. */
export function childElements(element: Element): Element[] {
  return Array.from(element.children);
}

/** Premier enfant direct `w:<name>`, ou null. */
export function wChild(element: Element | null | undefined, name: string): Element | null {
  if (!element) return null;
  for (const child of Array.from(element.children)) if (isW(child, name)) return child;
  return null;
}

/** Enfants directs `w:<name>`. */
export function wChildren(element: Element, name: string): Element[] {
  return Array.from(element.children).filter((child) => isW(child, name));
}

/** Attribut d'un espace de noms parmi `namespaces`, par son nom local. */
function namespacedAttr(element: Element, name: string, namespaces: Set<string>): string | null {
  for (const attr of Array.from(element.attributes)) {
    if (attr.localName === name && namespaces.has(attr.namespaceURI ?? "")) return attr.value;
  }
  return null;
}

/** Attribut `w:<name>` (par exemple `w:val`), ou null. */
export function wAttr(element: Element | null | undefined, name: string): string | null {
  return element ? namespacedAttr(element, name, W_NAMESPACES) : null;
}

/** Attribut `r:<name>` (par exemple `r:id`, `r:embed`), ou null. */
export function rAttr(element: Element | null | undefined, name: string): string | null {
  return element ? namespacedAttr(element, name, R_NAMESPACES) : null;
}

/** Valeur `w:val` de l'enfant `w:<name>`, ou null. */
export function wVal(element: Element | null | undefined, name: string): string | null {
  return wAttr(wChild(element, name), "val");
}

/**
 * Propriété à bascule de Word (`<w:b/>`, `<w:b w:val="0"/>`) : undefined si absente, sinon vrai sauf pour
 * `0`, `false`, `off` ou `none`.
 */
export function onOff(element: Element | null): boolean | undefined {
  if (!element) return undefined;
  const value = wAttr(element, "val");
  return value === null || !["0", "false", "off", "none"].includes(value.toLowerCase());
}

/** Nombre entier lu dans un attribut, ou null. */
export function intAttr(value: string | null): number | null {
  if (value === null) return null;
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : null;
}

/** Vrai si un descendant a ce nom local, quel que soit son espace de noms (`txbx`, `blip`, `chart`…). */
export function hasDescendant(element: Element, localName: string): boolean {
  return element.getElementsByTagNameNS("*", localName).length > 0;
}

/** Descendants de ce nom local, quel que soit leur espace de noms. */
export function descendants(element: Element, localName: string): Element[] {
  return Array.from(element.getElementsByTagNameNS("*", localName));
}
