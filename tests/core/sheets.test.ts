// Tests des feuilles séparées (src/core/sheets.ts, PL6) : place des feuilles, décalage du texte de chaque page,
// feuille agrandie dans une fenêtre étroite, coupures à l'écran pour le compteur, feuille d'une hauteur.
import { describe, expect, it } from "vitest";
import { pageAt } from "../../src/core/pageBreaks";
import { planSheets, screenLayout, sheetAt, SHEET_GAP } from "../../src/core/sheets";

const METRICS = { textHeight: 1000, marginTop: 100, marginBottom: 80, gap: SHEET_GAP };

describe("PL6 : feuilles séparées", () => {
  it("critère 1 : un document d'une page a une seule feuille, de la hauteur imprimée", () => {
    const plan = planSheets([], 200, METRICS);
    expect(plan.sheets).toEqual([{ page: 1, top: 0, height: 1180 }]);
    expect(plan.shifts).toEqual([]);
    expect(plan.height).toBe(1180);
  });

  it("critères 1 et 2 : chaque page commence en haut de la zone de texte de sa feuille, après l'espace gris", () => {
    const plan = planSheets(
      [
        { page: 2, top: 990, previousBottom: 980 },
        { page: 3, top: 1950, previousBottom: 1950 },
      ],
      2300,
      METRICS,
    );
    expect(plan.sheets.map((sheet) => sheet.top)).toEqual([0, 1204, 2408]);
    expect(plan.sheets.map((sheet) => sheet.height)).toEqual([1180, 1180, 1180]);
    // Le texte de la page 2 (990 dans la feuille continue) arrive à 1204 depuis le haut de l'éditeur.
    expect(plan.targets).toEqual([1204, 2408]);
    expect(plan.shifts[0]).toBe(1204 - 990);
    expect((plan.shifts[0] ?? 0) + (plan.shifts[1] ?? 0)).toBe(2408 - 1950);
    expect(plan.height).toBe(2408 + 1180);
  });

  it("critère 9 : dans une fenêtre étroite, une feuille grandit si le texte de sa page y est plus haut", () => {
    const plan = planSheets([{ page: 2, top: 1300, previousBottom: 1290 }], 1500, METRICS);
    expect(plan.sheets[0]?.height).toBe(100 + 1290 + 80);
    expect(plan.sheets[1]?.height).toBe(1180);
  });

  it("critère 7 : le compteur suit la feuille au milieu de la fenêtre", () => {
    const plan = planSheets([{ page: 2, top: 990, previousBottom: 980 }], 1500, METRICS);
    const layout = screenLayout(
      { pageCount: 2, starts: [{ page: 2, y: 985, start: 990 }] },
      plan,
      METRICS.marginTop,
    );
    expect(pageAt(layout, 500)).toBe(1);
    expect(pageAt(layout, 1204 - 100 - SHEET_GAP / 2 + 1)).toBe(2);
    expect(sheetAt(plan.sheets, 600)).toBe(1);
    expect(sheetAt(plan.sheets, 1300)).toBe(2);
  });

  it("cas limite : un document vide a une feuille", () => {
    expect(planSheets([], 0, METRICS).sheets).toHaveLength(1);
  });

  it("cas limite : 100 pages se placent l'une après l'autre", () => {
    const starts = Array.from({ length: 99 }, (_, index) => ({
      page: index + 2,
      top: (index + 1) * 1000,
      previousBottom: (index + 1) * 1000 - 10,
    }));
    const plan = planSheets(starts, 100_000, METRICS);
    expect(plan.sheets).toHaveLength(100);
    expect(plan.sheets.at(-1)?.top).toBe(99 * (1180 + SHEET_GAP));
  });
});
