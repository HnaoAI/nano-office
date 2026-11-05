// Couleurs des corrections de l'assistant (T2.22, critères 1 à 4) : valeurs de la charte, contraste
// d'au moins 4,5:1 sur leur fond, et utilisées seulement par les marques de suggestion.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(new URL(`../../src/ui/styles/${name}.css`, import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
const tokens = read("tokens");

function token(name: string): string {
  const match = new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i").exec(tokens);
  if (!match?.[1]) throw new Error(`variable absente : ${name}`);
  return match[1].toLowerCase();
}

/** Luminance relative WCAG 2 d'une couleur `#rrggbb`. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe("T2.22 : couleurs des corrections de l'assistant", () => {
  it("critères 1 et 2 : rouge #C62828 sur #FDECEA, vert #2E7D32 sur #E8F5E9", () => {
    expect(token("--nano-suggest-removed")).toBe("#c62828");
    expect(token("--nano-suggest-removed-bg")).toBe("#fdecea");
    expect(token("--nano-suggest-inserted")).toBe("#2e7d32");
    expect(token("--nano-suggest-inserted-bg")).toBe("#e8f5e9");
  });

  it("critère 3 : chaque couleur reste lisible sur son fond (contraste d'au moins 4,5:1)", () => {
    expect(
      contrast(token("--nano-suggest-removed"), token("--nano-suggest-removed-bg")),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(token("--nano-suggest-inserted"), token("--nano-suggest-inserted-bg")),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("critère 4 : les couleurs ne servent qu'aux marques de suggestion, par leurs variables", () => {
    const files = [
      "layout",
      "pages",
      "toolbar",
      "pickers",
      "tables",
      "images",
      "search",
      "messages",
      "dialog",
      "print",
      "update",
      "help",
      "outline",
      "diagram",
    ];
    for (const name of files) expect(read(name), name).not.toMatch(/--nano-suggest-/);
    const uses = read("assistant").match(/^[^{}]*\{[^}]*var\(--nano-suggest-[^}]*\}/gm) ?? [];
    expect(uses.length).toBeGreaterThan(0);
    for (const rule of uses) expect(rule.split("{")[0]).toMatch(/nano-suggest-(removed|inserted)/);
  });
});
