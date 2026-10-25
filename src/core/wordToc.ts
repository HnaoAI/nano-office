// Sommaire dans l'export Word (T2.17, critère 5) : titre « Sommaire » et champ de table des matières de
// Word, écrit avec ses lignes et ses numéros de page, que Word peut mettre à jour. Bibliothèque `docx`
// (MIT). Les titres reçoivent leur signet dans wordBlocks.ts.
import { Paragraph, TableOfContents, TextRun } from "docx";
import { tocLineText, wordBookmark, type TocEntry } from "./toc";
import { TOC_TITLE } from "./tocSchema";

/** Ce qu'il faut pour écrire un sommaire : ses lignes et le numéro de page de chaque titre. */
export interface WordToc {
  entries: readonly TocEntry[];
  /** Numéro de page par identifiant de bloc du titre, calculé à l'écran (T2.8). */
  pages: ReadonlyMap<string, number>;
}

/**
 * Blocs Word d'un sommaire : le titre « Sommaire » (gras, hors des styles de titre pour ne pas figurer
 * dans le sommaire lui-même), puis le champ de table des matières des Titre 1 à 3, avec ses lignes
 * déjà écrites. Le champ est écrit « à jour » : Word l'affiche tel quel, sans demander de mise à jour
 * à l'ouverture ; « Mettre à jour le champ » le recalcule.
 */
export function wordTocBlocks(toc: WordToc): (Paragraph | TableOfContents)[] {
  const title = new Paragraph({
    children: [new TextRun({ text: TOC_TITLE, bold: true, size: 32 })],
    spacing: { after: 180 },
    keepNext: true,
  });
  const cachedEntries = toc.entries.map((entry) => ({
    title: tocLineText(entry),
    level: Math.min(Math.max(entry.level, 1), 3),
    ...(entry.id !== null && toc.pages.has(entry.id) ? { page: toc.pages.get(entry.id) } : {}),
    ...(entry.id !== null ? { href: wordBookmark(entry.id) } : {}),
  }));
  return [
    title,
    new TableOfContents(TOC_TITLE, {
      hyperlink: true,
      headingStyleRange: "1-3",
      cachedEntries,
      beginDirty: false,
    }),
  ];
}
