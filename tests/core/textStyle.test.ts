// Tests des polices et tailles du document (src/core/textStyle.ts, T1.4) : liste des polices, piles
// CSS de secours, rendu HTML d'une police connue ou inconnue.
import { describe, expect, it } from "vitest";
import { documentSchema } from "../../src/core/schema";
import {
  DEFAULT_FONT,
  DEFAULT_FONT_SIZE,
  DOCUMENT_FONTS,
  FONT_SIZES,
  fontSizePoints,
  fontStack,
} from "../../src/core/textStyle";

/** Attributs HTML rendus pour une marque `textStyle`, sans navigateur. */
function rendered(attrs: Record<string, unknown>) {
  const mark = documentSchema.marks.textStyle?.create(attrs);
  if (!mark) throw new Error("marque textStyle absente du schéma");
  const spec = mark.type.spec.toDOM?.(mark, true);
  return (Array.isArray(spec) ? spec[1] : {}) as Record<string, string>;
}

describe("polices et tailles (T1.4)", () => {
  it("critère 1 : cinq polices intégrées, dans l'ordre de la maquette", () => {
    expect(DOCUMENT_FONTS.map((font) => font.name)).toEqual([
      "IBM Plex Sans",
      "IBM Plex Serif",
      "IBM Plex Mono",
      "Source Sans 3",
      "EB Garamond",
    ]);
  });

  it("critère 2 : les tailles proposées", () => {
    expect([...FONT_SIZES]).toEqual([8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72]);
  });

  it("critère 5 : un nouveau document utilise IBM Plex Sans en taille 12", () => {
    expect(DEFAULT_FONT).toBe("IBM Plex Sans");
    expect(DEFAULT_FONT_SIZE).toBe(12);
  });

  it("critère 7 : chaque police a sa pile CSS, sans police du système proposée", () => {
    for (const { name } of DOCUMENT_FONTS) {
      expect(fontStack(name).startsWith(`"${name}", `)).toBe(true);
      expect(fontStack(name)).not.toMatch(/Arial|Helvetica|Times|Georgia|Corbel|Calibri/);
    }
  });

  it("critère 8 : une police inconnue s'affiche avec la police par défaut, son nom reste dans data-font", () => {
    expect(fontStack("Futura Nova")).toBe(fontStack(DEFAULT_FONT));
    const attrs = rendered({ fontFamily: "Futura Nova", fontSize: "14pt" });
    expect(attrs["data-font"]).toBe("Futura Nova");
    expect(attrs.style).toContain('font-family: "IBM Plex Sans", sans-serif');
    expect(attrs.style).not.toContain("Futura");
    expect(attrs.style).toContain("font-size: 14pt");
  });

  it("n'écrit dans le style aucune valeur abîmée ou dangereuse", () => {
    const attrs = rendered({ fontFamily: 'x"; color: red', fontSize: "12pt; color: red" });
    expect(attrs.style).toBe('font-family: "IBM Plex Sans", sans-serif');
  });

  it("lit une taille en points, refuse les autres unités", () => {
    expect(fontSizePoints("14pt")).toBe(14);
    expect(fontSizePoints("10.5pt")).toBe(10.5);
    expect(fontSizePoints("16px")).toBeNull();
    expect(fontSizePoints(null)).toBeNull();
  });
});
