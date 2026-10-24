// Export d'un document en fichier Word `.docx` (T2.7) avec la bibliothèque `docx` (MIT) : styles des
// titres de Word, listes, page A4 avec l'orientation et les marges du document (T2.5), polices
// embarquées, numéros de page (T2.15), en-tête et pied de page (T2.16) de Word. Logique pure, testée sans navigateur ; les blocs sont convertis par wordBlocks.ts.
// L'écriture du fichier passe par src/storage/exportStore.ts.
import {
  AlignmentType,
  CharacterSet,
  Document,
  Footer,
  Header,
  LevelFormat,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
  type ILevelsOptions,
} from "docx";
import { documentTitle } from "./documentFile";
import {
  DEFAULT_HEADER_FOOTER,
  marginBoxes,
  type HeaderFooter,
  type MarginBoxes,
  type MarginPart,
} from "./headerFooter";
import { pageSize, type PageSetup } from "./pageSetup";
import { jsonHasToc, tocEntriesFromJson, wordBookmark } from "./toc";
import { DEFAULT_FONT, DOCUMENT_FONTS } from "./textStyle";
import type { DocumentJson } from "./types";
import {
  BULLET_LIST,
  convertBlock,
  LIST_INDENT,
  ORDERED_LIST,
  type BlockContext,
  type WordImage,
} from "./wordBlocks";

export type { WordImage } from "./wordBlocks";

/** Police à embarquer : ses quatre styles au format TrueType (le gras et l'italique sont facultatifs). */
export interface WordFont {
  name: string;
  regular: Uint8Array;
  bold?: Uint8Array;
  italic?: Uint8Array;
  boldItalic?: Uint8Array;
}

/** Ce qu'il faut pour exporter un document. */
export interface WordExportInput {
  /** Document au format JSON de Tiptap (`contentOf`). */
  content: DocumentJson;
  pageSetup: PageSetup;
  /** Images utilisées, par empreinte ; une image absente s'exporte « Image manquante ». */
  images: ReadonlyMap<string, WordImage>;
  /** Polices à embarquer ; vide : seuls leurs noms sont écrits (T2.7, critère 4). */
  fonts: readonly WordFont[];
  /** Numéros de page, en-tête et pied de page (T2.15, T2.16) ; aucun par défaut. */
  headerFooter?: HeaderFooter;
  /**
   * Numéro de page de chaque titre, par identifiant de bloc, calculé à l'écran (T2.8), pour le sommaire
   * (T2.17). Un titre absent est écrit sans numéro ; Word le remplit en mettant le champ à jour.
   */
  tocPages?: ReadonlyMap<string, number>;
}

/** Type MIME d'un fichier Word. */
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Pixels (96 par pouce) par centimètre. */
const PX_PER_CM = 96 / 2.54;

/** Vingtièmes de point d'une longueur en centimètres. */
function twips(cm: number): number {
  return Math.round((cm / 2.54) * 1440);
}

/**
 * Nom proposé pour le fichier Word : le nom du document, sans `.nano` (T2.7, critère 1).
 * @param fileName nom du fichier `.nano`, ou null pour un document jamais enregistré (« Sans titre »)
 */
export function wordFileName(fileName: string | null): string {
  return `${documentTitle(fileName)}.docx`;
}

/** Polices du document utilisées par `content` : la police par défaut, puis celles des marques connues. */
export function usedFonts(content: DocumentJson): string[] {
  const found = new Set<string>([DEFAULT_FONT]);
  const visit = (node: DocumentJson) => {
    for (const mark of node.marks ?? []) {
      const name = mark.attrs?.fontFamily;
      if (mark.type === "textStyle" && DOCUMENT_FONTS.some((font) => font.name === name)) {
        found.add(name as string);
      }
    }
    node.content?.forEach(visit);
  };
  visit(content);
  return [...found];
}

/** Niveaux d'une liste : puces « • ◦ ▪ » ou numéros « 1. », comme à l'écran, sur trois niveaux (T1.2). */
function listLevels(ordered: boolean): ILevelsOptions[] {
  return [0, 1, 2].map((level) => ({
    level,
    format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
    text: ordered ? `%${String(level + 1)}.` : (["•", "◦", "▪"][level] as string),
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: LIST_INDENT * (level + 1), hanging: LIST_INDENT } } },
  }));
}

/** Style de titre de Word (« Titre 1 » à « Titre 3 » dans Word en français), aux tailles de la charte. */
function headingStyle(points: number, after: number, cssLine: number) {
  return {
    run: { size: Math.round(points * 2), bold: true, color: "1B1B1A", font: DEFAULT_FONT },
    paragraph: {
      spacing: { before: 0, after, line: Math.round((cssLine / 1.2) * 240) },
      keepNext: true,
    },
  };
}

/** Texte des en-têtes et pieds de page : IBM Plex Sans 10 pt, couleur du texte discret, comme à l'impression. */
const MARGIN_RUN = { font: DEFAULT_FONT, size: 20, color: "5F5F5C" } as const;

/** Morceaux d'une zone de marge en texte de Word : le numéro est le champ de numéro de page de Word. */
function marginRuns(parts: readonly MarginPart[] | undefined): TextRun[] {
  return (parts ?? []).map((part) =>
    part.kind === "page"
      ? new TextRun({ ...MARGIN_RUN, children: [PageNumber.CURRENT] })
      : new TextRun({ ...MARGIN_RUN, text: part.text }),
  );
}

/**
 * Une ligne d'en-tête ou de pied de page de Word : la zone de gauche, puis une tabulation centrée et
 * une tabulation à droite, comme les en-têtes de Word, pour les zones du centre et de droite.
 * @param zones zones du haut ou du bas d'une page
 * @param widthTwips largeur de la zone de texte
 */
function marginParagraph(zones: MarginBoxes["top"], widthTwips: number): Paragraph {
  return new Paragraph({
    tabStops: [
      { type: TabStopType.CENTER, position: Math.round(widthTwips / 2) },
      { type: TabStopType.RIGHT, position: widthTwips },
    ],
    spacing: { before: 0, after: 0 },
    children: [
      ...marginRuns(zones.left),
      new TextRun({ ...MARGIN_RUN, children: [new Tab()] }),
      ...marginRuns(zones.center),
      new TextRun({ ...MARGIN_RUN, children: [new Tab()] }),
      ...marginRuns(zones.right),
    ],
  });
}

/**
 * En-têtes et pieds de page de Word (T2.15, critère 3 ; T2.16, critère 5), avec une première page
 * différente quand une case « première page » est cochée. Rien quand aucun n'est réglé.
 */
function wordHeadersFooters(settings: HeaderFooter, widthTwips: number) {
  const others = marginBoxes(settings, false);
  if (Object.keys(others.top).length + Object.keys(others.bottom).length === 0) return {};
  const first = marginBoxes(settings, true);
  const titlePage = JSON.stringify(first) !== JSON.stringify(others);
  const header = (boxes: MarginBoxes) =>
    new Header({ children: [marginParagraph(boxes.top, widthTwips)] });
  const footer = (boxes: MarginBoxes) =>
    new Footer({ children: [marginParagraph(boxes.bottom, widthTwips)] });
  return {
    titlePage,
    headers: titlePage
      ? { default: header(others), first: header(first) }
      : { default: header(others) },
    footers: titlePage
      ? { default: footer(others), first: footer(first) }
      : { default: footer(others) },
  };
}

/**
 * Distance entre le bord de la feuille et l'en-tête (ou le pied de page), en centimètres : la ligne de
 * 10 pt est centrée dans la marge, comme à l'impression.
 */
function marginTextDistance(marginCm: number): number {
  return Math.max(0, marginCm / 2 - 0.21);
}

/**
 * Styles des lignes du sommaire de Word (T2.17) : « toc 1 » à « toc 3 », comme ceux de Word, en retrait
 * de 0,53 cm par niveau comme à l'écran, sans espace entre deux lignes.
 */
const TOC_STYLES = [1, 2, 3].map((level) => ({
  id: `TOC${String(level)}`,
  name: `toc ${String(level)}`,
  basedOn: "Normal",
  next: "Normal",
  paragraph: { indent: { left: (level - 1) * 300 }, spacing: { after: 60 } },
}));

/**
 * Document Word d'un document Nano Buro.
 * @param input contenu, mise en page, images et polices
 */
export function buildWordDocument(input: WordExportInput): Document {
  const size = pageSize(input.pageSetup.orientation);
  const portrait = pageSize("portrait");
  const { top, bottom, left, right } = input.pageSetup.margins;
  const toc = jsonHasToc(input.content)
    ? { entries: tocEntriesFromJson(input.content), pages: input.tocPages ?? new Map() }
    : undefined;
  const context: BlockContext = {
    images: input.images,
    textWidthPx: (size.width - left - right) * PX_PER_CM,
    nextListInstance: 1,
    toc,
  };
  // Sommaire (T2.17) : chaque titre de premier niveau porte un signet, cible de sa ligne. L'espace
  // après un titre vient de son style de Word : le style du bloc n'a besoin que du signet.
  const children = (input.content.content ?? []).flatMap((block) => {
    const id: unknown = block.attrs?.id;
    return toc && block.type === "heading" && typeof id === "string" && id !== ""
      ? convertBlock(block, context, { bookmark: wordBookmark(id) })
      : convertBlock(block, context);
  });
  const margins = wordHeadersFooters(
    input.headerFooter ?? DEFAULT_HEADER_FOOTER,
    twips(size.width - left - right),
  );
  return new Document({
    creator: "Nano Buro",
    styles: {
      default: {
        document: {
          run: { font: DEFAULT_FONT, size: 24, color: "1B1B1A" },
          paragraph: { spacing: { after: 240 } },
        },
        // Tailles de la charte (34, 21 et 18 px), marges sous le titre comme à l'écran (T1.1).
        heading1: headingStyle(25.5, 180, 1.2),
        heading2: headingStyle(15.75, 150, 1.3),
        heading3: headingStyle(13.5, 120, 1.4),
      },
      // Lignes du sommaire (T2.17) : styles « toc 1 » à « toc 3 » de Word, en retrait selon le niveau.
      paragraphStyles: toc ? TOC_STYLES : [],
    },
    numbering: {
      config: [
        { reference: BULLET_LIST, levels: listLevels(false) },
        { reference: ORDERED_LIST, levels: listLevels(true) },
      ],
    },
    fonts: input.fonts.map((font) => ({
      name: font.name,
      // `docx` attend des Buffer de Node ; il n'en lit que les octets, un Uint8Array suffit au navigateur.
      data: font.regular as Buffer,
      bold: font.bold as Buffer | undefined,
      italic: font.italic as Buffer | undefined,
      boldItalic: font.boldItalic as Buffer | undefined,
      characterSet: CharacterSet.ANSI,
    })),
    sections: [
      {
        properties: {
          page: {
            // Toujours les dimensions du portrait : `docx` les inverse lui-même en paysage.
            size: {
              width: twips(portrait.width),
              height: twips(portrait.height),
              orientation:
                input.pageSetup.orientation === "landscape"
                  ? PageOrientation.LANDSCAPE
                  : PageOrientation.PORTRAIT,
            },
            margin: {
              top: twips(top),
              bottom: twips(bottom),
              left: twips(left),
              right: twips(right),
              header: twips(marginTextDistance(top)),
              footer: twips(marginTextDistance(bottom)),
              gutter: 0,
            },
          },
          titlePage: margins.titlePage === true ? true : undefined,
        },
        headers: margins.headers,
        footers: margins.footers,
        // Word refuse une section vide : un document vide garde un paragraphe vide.
        children: children.length > 0 ? children : convertBlock({ type: "paragraph" }, context),
      },
    ],
  });
}

/**
 * Contenu du fichier `.docx` d'un document. Rien ne passe par le réseau (critère 6).
 * @returns les octets du fichier, à écrire par `storage/`
 */
export async function exportWord(input: WordExportInput): Promise<Uint8Array> {
  return new Uint8Array(await Packer.toArrayBuffer(buildWordDocument(input)));
}
