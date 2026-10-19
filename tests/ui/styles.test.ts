// Vérifie que la feuille de style de l'interface (src/ui/styles.css) suit la charte (U1a, critère 10) :
// couleurs, rayons et ombres sont des variables `--nano-…` définies une seule fois, dans `:root`.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../src/ui/styles.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Contenu du bloc `:root { … }`, seul endroit où les valeurs de la charte sont écrites. */
function rootBlock(): string {
  const match = /:root\s*\{([^}]*)\}/.exec(css);
  if (!match?.[1]) throw new Error("bloc :root absent de styles.css");
  return match[1];
}

describe("styles.css (U1a)", () => {
  it("critère 10 : les couleurs, rayons et ombres viennent de variables --nano-… définies dans :root", () => {
    const outside = css.replace(/:root\s*\{[^}]*\}/, "");
    expect(outside.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi) ?? []).toEqual([]);
    const shadows = outside.match(/box-shadow:[^;]*/g) ?? [];
    expect(shadows.filter((rule) => !/var\(--nano-|none/.test(rule))).toEqual([]);
    const radii = outside.match(/border-radius:[^;]*/g) ?? [];
    expect(radii.filter((rule) => !/var\(--nano-|^border-radius:\s*0$/.test(rule))).toEqual([]);
  });

  it("critère 10 : chaque variable --nano-… est définie une seule fois", () => {
    const names = [...rootBlock().matchAll(/(--nano-[\w-]+)\s*:/g)].map((match) => match[1]);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
    expect(css.match(/--nano-[\w-]+\s*:/g)?.length).toBe(names.length);
  });

  it("critère 10 : toute variable utilisée est définie", () => {
    const defined = new Set([...rootBlock().matchAll(/(--nano-[\w-]+)\s*:/g)].map((m) => m[1]));
    const used = [...css.matchAll(/var\((--nano-[\w-]+)\)/g)].map((match) => match[1]);
    expect(used.filter((name) => !defined.has(name))).toEqual([]);
  });

  it("critère 6 : aucune police n'est chargée depuis un autre site", () => {
    expect(css).not.toMatch(/@import|https?:\/\//);
  });
});
