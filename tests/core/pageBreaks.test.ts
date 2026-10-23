// Coupures de page (T2.8, critères 3 et 4) : calcul pur à partir de hauteurs mesurées, avec un titre en bas
// de page, une ligne de tableau, une image, un saut de page manuel, un document vide et 100 pages.
import { describe, expect, it } from "vitest";
import {
  computePageBreaks,
  pageAt,
  pageCounterText,
  placeOnScreen,
  PX_PER_CM,
  textAreaHeight,
  textAreaWidth,
  type LineBox,
  type PageUnit,
  type PageUnitKind,
} from "../../src/core/pageBreaks";
import { DEFAULT_PAGE_SETUP } from "../../src/core/pageSetup";

/** Hauteur d'une page des exemples, en pixels, et hauteur d'une ligne. */
const PAGE = 1000;
const LINE = 20;
/** Marge sous chaque bloc, comme les 16 px sous un paragraphe. */
const GAP = 16;

interface Block {
  kind: PageUnitKind;
  /** Nombre de lignes d'un paragraphe ou d'un titre, ou hauteur (en pixels) d'un bloc `keep`. */
  lines?: number;
  height?: number;
}

/** Élément d'indice donné, qui doit exister. */
function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`élément ${String(index)} absent`);
  return item;
}

/** Empile des blocs comme le navigateur, et rend les morceaux et leurs lignes. */
function layout(blocks: Block[]) {
  const units: PageUnit[] = [];
  const lines: LineBox[][] = [];
  let y = 0;
  for (const block of blocks) {
    const height = block.kind === "break" ? 24 : (block.height ?? (block.lines ?? 1) * LINE);
    units.push({ kind: block.kind, top: y, bottom: y + height });
    const boxes: LineBox[] = [];
    if (block.kind === "text" && !block.height) {
      for (let line = 0; line < (block.lines ?? 1); line++) {
        boxes.push({ top: y + line * LINE, bottom: y + (line + 1) * LINE });
      }
    }
    lines.push(boxes);
    y += height + GAP;
  }
  const asked: number[] = [];
  const result = computePageBreaks(units, PAGE, (index) => {
    asked.push(index);
    return lines[index] ?? [];
  });
  return { units, result, asked };
}

/** Indice du premier morceau de chaque page après la première. */
function firstUnits(units: PageUnit[], starts: { start: number }[]): number[] {
  return starts.map(({ start }) => units.findIndex((unit) => unit.bottom > start));
}

/** Paragraphes de `lines` lignes, assez pour remplir `pages` pages. */
function filler(count: number, lines = 4): Block[] {
  return Array.from({ length: count }, () => ({ kind: "text" as const, lines }));
}

describe("T2.8 : calcul des coupures de page", () => {
  it("critère 3 : la zone de texte est la feuille A4 sans les marges du haut et du bas", () => {
    expect(textAreaHeight(DEFAULT_PAGE_SETUP)).toBeCloseTo((29.7 - 5) * PX_PER_CM);
    expect(
      textAreaHeight({
        orientation: "landscape",
        margins: { top: 1, bottom: 2, left: 3, right: 4 },
      }),
    ).toBeCloseTo((21 - 3) * PX_PER_CM);
  });

  it("document vide : une seule page, « Page 1 sur 1 »", () => {
    const { result } = layout([]);
    expect(result).toEqual({ pageCount: 1, starts: [] });
    expect(pageCounterText(pageAt(result, 500), result.pageCount)).toBe("Page 1 sur 1");
    const empty = layout([{ kind: "text", lines: 1 }]);
    expect(empty.result.pageCount).toBe(1);
  });

  it("critère 3 : un paragraphe qui dépasse est coupé entre deux lignes, au bas de la page", () => {
    // 10 paragraphes de 4 lignes (96 px chacun) : le onzième commence à 960 px et dépasse.
    const { units, result } = layout(filler(12));
    expect(result.pageCount).toBe(2);
    const [start] = result.starts;
    // Deux lignes du onzième paragraphe tiennent (960 à 1000 px) : la coupure tombe après elles.
    expect(start).toEqual({
      page: 2,
      y: nth(units, 10).top + 2 * LINE,
      start: nth(units, 10).top + 2 * LINE,
    });
  });

  it("critère 3 : au moins deux lignes de chaque côté d'une coupure (sinon le paragraphe passe en entier)", () => {
    // Le onzième paragraphe commence à 976 px : une seule ligne tiendrait, il passe à la page 2.
    const blocks: Block[] = [...filler(10), { kind: "keep", height: 0 }, ...filler(2)];
    const { units, result } = layout(blocks);
    expect(nth(units, 11).top).toBe(976);
    expect(firstUnits(units, result.starts)).toEqual([11]);
    expect(nth(result.starts, 0).start).toBe(976);
    // Le repère est entre les deux blocs, au milieu de l'espace qui les sépare.
    expect(nth(result.starts, 0).y).toBe((nth(units, 10).bottom + nth(units, 11).top) / 2);

    // Paragraphe de quatre lignes à 940 px : trois tiendraient, mais une seule passerait à la page 2.
    const widow = layout([...filler(9), { kind: "keep", height: 60 }, { kind: "text", lines: 4 }]);
    expect(nth(widow.units, 10).top).toBe(940);
    expect(nth(widow.result.starts, 0).start).toBe(940 + 2 * LINE);
  });

  it("critère 3 : un titre n'est jamais seul en bas de page", () => {
    // Le titre tient en bas de la page 1 (936 à 956 px), pas le paragraphe qui le suit.
    const blocks: Block[] = [
      ...filler(9),
      { kind: "keep", height: 36 - GAP + 36 },
      { kind: "heading", lines: 1 },
      { kind: "text", lines: 4 },
    ];
    const { units, result } = layout(blocks);
    expect(nth(units, 10).bottom).toBeLessThanOrEqual(PAGE);
    expect(firstUnits(units, result.starts)).toEqual([10]);
  });

  it("critère 3 : deux titres de suite passent ensemble à la page suivante", () => {
    const blocks: Block[] = [
      ...filler(9),
      { kind: "keep", height: 30 },
      { kind: "heading", lines: 1 },
      { kind: "heading", lines: 1 },
      { kind: "text", lines: 4 },
    ];
    const { units, result } = layout(blocks);
    expect(firstUnits(units, result.starts)).toEqual([10]);
  });

  it("critère 3 : un titre en haut de page reste là, même si ce qui suit ne tient pas", () => {
    const blocks: Block[] = [
      { kind: "heading", lines: 1 },
      { kind: "keep", height: 1500 },
      { kind: "text", lines: 2 },
    ];
    const { result } = layout(blocks);
    // L'image trop haute passe à la page 2 sans emmener le titre, puis est coupée au bas de la page.
    expect(result.starts.map(({ start }) => start)).toEqual([36, 1036]);
  });

  it("critère 3 : une ligne de tableau n'est jamais coupée", () => {
    const rows: Block[] = Array.from({ length: 30 }, () => ({ kind: "keep", height: 40 }));
    const { units, result } = layout([{ kind: "heading", lines: 1 }, ...rows]);
    for (const { start } of result.starts) {
      expect(units.some((unit) => unit.top < start - 0.5 && unit.bottom > start + 0.5)).toBe(false);
    }
    // 1 titre + 17 lignes de 56 px sur la page 1 : la dix-huitième commence à 988 px.
    expect(firstUnits(units, result.starts)).toEqual([18]);
  });

  it("critère 3 : une image n'est jamais coupée, et passe à la page suivante", () => {
    const { units, result } = layout([...filler(8), { kind: "keep", height: 300 }]);
    expect(firstUnits(units, result.starts)).toEqual([8]);
    expect(nth(result.starts, 0).start).toBe(nth(units, 8).top);
  });

  it("critère 6 : un saut de page manuel commence une nouvelle page, même en haut de page", () => {
    const { units, result } = layout([
      { kind: "text", lines: 2 },
      { kind: "break" },
      { kind: "text", lines: 2 },
      { kind: "break" },
      { kind: "heading", lines: 1 },
    ]);
    expect(result.pageCount).toBe(3);
    expect(firstUnits(units, result.starts)).toEqual([2, 4]);
    // Le repère suit la ligne « Saut de page ».
    expect(nth(result.starts, 0).y).toBe((nth(units, 1).bottom + nth(units, 2).top) / 2);
  });

  it("critère 6 : un saut de page en tête de document ne crée pas de page vide", () => {
    const { result } = layout([{ kind: "break" }, { kind: "text", lines: 2 }]);
    expect(result.pageCount).toBe(1);
  });

  it("critère 6 : la ligne d'un saut de page qui ouvre le document ne compte pas sur la page 1", () => {
    // Le saut de page (24 px et sa marge) n'est pas imprimé : la page 1 commence au paragraphe.
    const { units, result } = layout([{ kind: "break" }, { kind: "text", lines: 51 }]);
    const start = nth(units, 1).top;
    expect(nth(result.starts, 0).start).toBe(start + 50 * LINE - LINE);
  });

  it("critère 6 : deux sauts de page en tête de document laissent la page 1 vide, comme à l'impression", () => {
    const { units, result } = layout([
      { kind: "break" },
      { kind: "break" },
      { kind: "text", lines: 2 },
    ]);
    expect(result.pageCount).toBe(2);
    expect(firstUnits(units, result.starts)).toEqual([2]);
  });

  it("critère 6 : deux sauts de page de suite laissent une page vide", () => {
    const { result } = layout([
      { kind: "text", lines: 2 },
      { kind: "break" },
      { kind: "break" },
      { kind: "text", lines: 2 },
    ]);
    expect(result.pageCount).toBe(3);
  });

  it("critère 3 : un paragraphe plus long que plusieurs pages est coupé sur chacune", () => {
    const { result } = layout([{ kind: "text", lines: 120 }]);
    expect(result.pageCount).toBe(3);
    expect(result.starts.map(({ start }) => start)).toEqual([1000, 2000]);
  });

  it("critère 4 : seuls les paragraphes qui traversent une fin de page sont mesurés ligne à ligne", () => {
    const { asked, result } = layout(filler(60));
    expect(asked.length).toBeLessThanOrEqual(result.pageCount * 2);
  });

  it("critère 4 : 100 pages se calculent en quelques millisecondes", () => {
    const blocks: Block[] = [];
    for (let section = 0; section < 400; section++) {
      blocks.push({ kind: "heading", lines: 1 }, ...filler(2, 5), { kind: "keep", height: 40 });
    }
    const started = performance.now();
    const { result } = layout(blocks);
    const elapsed = performance.now() - started;
    expect(result.pageCount).toBeGreaterThanOrEqual(100);
    expect(elapsed).toBeLessThan(50);
  });

  it("critère 5 : la page d'une hauteur donnée, et le texte « Page 3 sur 7 »", () => {
    const { result } = layout([{ kind: "text", lines: 350 }]);
    expect(result.pageCount).toBe(7);
    expect(pageAt(result, 0)).toBe(1);
    expect(pageAt(result, 999)).toBe(1);
    expect(pageAt(result, 1000)).toBe(2);
    expect(pageAt(result, 2500)).toBe(3);
    expect(pageAt(result, 99999)).toBe(7);
    expect(pageCounterText(3, 7)).toBe("Page 3 sur 7");
  });

  it("critère 3 : la zone de texte a la largeur de la feuille sans les marges de gauche et de droite", () => {
    expect(textAreaWidth(DEFAULT_PAGE_SETUP)).toBeCloseTo(16 * PX_PER_CM);
    expect(
      textAreaWidth({
        orientation: "landscape",
        margins: { top: 1, bottom: 1, left: 2, right: 3 },
      }),
    ).toBeCloseTo((29.7 - 5) * PX_PER_CM);
  });

  it("critère 3 : dans une feuille plus étroite, les coupures de l'impression restent entre les mêmes blocs ou lignes", () => {
    // À l'impression : 3 blocs de 400 px ; à l'écran, plus étroit : 3 blocs de 600 px (lignes de 20 px).
    const printed: PageUnit[] = [0, 1, 2].map((index) => ({
      kind: "text",
      top: index * 416,
      bottom: index * 416 + 400,
    }));
    const shown: PageUnit[] = [0, 1, 2].map((index) => ({
      kind: "text",
      top: index * 616,
      bottom: index * 616 + 600,
    }));
    const shownLines = (index: number): LineBox[] =>
      Array.from({ length: 30 }, (_, line) => ({
        top: nth(shown, index).top + line * LINE,
        bottom: nth(shown, index).top + (line + 1) * LINE,
      }));
    const layout = {
      pageCount: 3,
      starts: [
        // Entre le 2e et le 3e bloc, puis au milieu du 3e bloc (à la moitié de sa hauteur).
        { page: 2, y: 824, start: 832 },
        { page: 3, y: 1032, start: 1032 },
      ],
    };
    const placed = placeOnScreen(layout, printed, shown, shownLines);
    expect(placed.pageCount).toBe(3);
    expect(placed.starts.map(({ y }) => y)).toEqual([(1216 + 1232) / 2, 1232 + 300]);
  });

  it("une page de hauteur nulle (mesure impossible) ne bloque pas", () => {
    expect(computePageBreaks([{ kind: "text", top: 0, bottom: 10 }], 0, () => [])).toEqual({
      pageCount: 1,
      starts: [],
    });
  });
});
