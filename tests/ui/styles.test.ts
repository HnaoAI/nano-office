// Vérifie que la feuille de style de l'interface (src/ui/styles.css) suit la charte (U1a, critère 10) :
// couleurs, rayons et ombres sont des variables `--nano-…` définies une seule fois, dans `:root`.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../src/ui/styles.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Variables de la charte posées par U1a ; U1b ne doit en ajouter aucune (critère 9). */
const U1A_VARIABLES = [
  "--nano-app-bg",
  "--nano-surface",
  "--nano-surface-muted",
  "--nano-group-bg",
  "--nano-separator-strong",
  "--nano-ink",
  "--nano-on-ink",
  "--nano-on-ink-muted",
  "--nano-document-text",
  "--nano-text-secondary",
  "--nano-text-quiet",
  "--nano-text-disabled",
  "--nano-icon-chip-on-ink",
  "--nano-font-sans",
  "--nano-font-mono",
  "--nano-radius-page",
  "--nano-radius-button",
  "--nano-radius-logo",
  "--nano-radius-group",
  "--nano-radius-message",
  "--nano-radius-bar",
  "--nano-radius-dialog",
  "--nano-radius-pill",
  "--nano-shadow-page",
  "--nano-shadow-bar",
  "--nano-shadow-primary",
  "--nano-shadow-logo",
  "--nano-shadow-info",
  "--nano-shadow-alert",
  "--nano-shadow-dialog",
  "--nano-shadow-pill",
  "--nano-focus-ring",
];

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

  it("U1b, critère 9 : aucune nouvelle couleur, aucun nouveau rayon ni aucune nouvelle ombre après U1a", () => {
    const names = [...rootBlock().matchAll(/(--nano-[\w-]+)\s*:/g)].map((match) => match[1]);
    expect(names.sort()).toEqual([...U1A_VARIABLES].sort());
  });

  it("critère 6 : aucune police n'est chargée depuis un autre site", () => {
    expect(css).not.toMatch(/@import|https?:\/\//);
  });
});
