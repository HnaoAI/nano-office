// Ouverture d'un fichier Word (T2.18) : champs de Word (`w:fldChar`, `w:instrText`) : liens, sommaire de Word devenu
// celui de Nano Buro (T2.17), autres champs remplacés par leur texte affiché. Logique pure.
import { isAllowedLinkUrl } from "./links";
import type { BlockContext, Field, ParagraphState } from "./wordImportTypes";
import { wAttr } from "./wordXml";

/** Adresse d'un champ `HYPERLINK "https://…"` (sans `\l`, qui renvoie dans le document), ou null. */
export function fieldHref(code: string): string | null {
  if (/\\l\b/.test(code)) return null;
  const match = /HYPERLINK\s+"([^"]+)"/i.exec(code) ?? /HYPERLINK\s+(\S+)/i.exec(code);
  const href = match?.[1] ?? null;
  return isAllowedLinkUrl(href) ? href : null;
}

/** Sorte d'un champ d'après son code : lien, sommaire, ou autre (date, numéro de page, renvoi…). */
export function fieldKind(code: string): Field["kind"] {
  const name = /^\s*(\w+)/.exec(code)?.[1]?.toUpperCase();
  return name === "HYPERLINK" ? "link" : name === "TOC" ? "toc" : "other";
}

/** Vrai si le texte est caché par un champ (son code) ou par le sommaire de Word (son résultat, remplacé). */
export function hiddenByField(context: BlockContext): boolean {
  return context.fields.some((field) => field.phase === "code" || field.kind === "toc");
}

/** Adresse du lien de champ en cours, ou null. */
export function fieldLink(context: BlockContext): string | null {
  for (let index = context.fields.length - 1; index >= 0; index--) {
    const field = context.fields[index];
    if (field?.kind === "link" && field.phase === "result") return field.href;
  }
  return null;
}

/** Lit un champ de Word (`w:fldChar`) : début, séparation entre code et résultat, fin. */
export function readFieldChar(
  element: Element,
  state: ParagraphState,
  context: BlockContext,
): void {
  if (context.ignoreFields) return;
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
