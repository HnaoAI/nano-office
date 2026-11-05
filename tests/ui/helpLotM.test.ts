// @vitest-environment jsdom
// Contenu de l'aide intégrée (A1) pour le lot M : copie automatique de la sélection (T2.21, critère 9).
import { describe, expect, it } from "vitest";
import { HELP_SECTIONS, type HelpBlock } from "../../src/ui/help/helpContent";

function texts(block: HelpBlock): string[] {
  switch (block.kind) {
    case "text":
      return [block.text];
    case "steps":
      return [...(block.title ? [block.title] : []), ...block.items];
    case "message":
      return [block.title, block.todo];
    case "shortcuts":
      return [];
  }
}

function sectionText(id: string): string {
  const section = HELP_SECTIONS.find((candidate) => candidate.id === id);
  if (!section) throw new Error(`section absente : ${id}`);
  return section.blocks.flatMap(texts).join(" ");
}

describe("aide du lot M", () => {
  it("T2.21, critère 9 : la partie sur le copier-coller explique la case de la copie automatique", () => {
    const text = sectionText("format");
    expect(text).toContain("Copier automatiquement la sélection");
    expect(text).toContain("« Réglages »");
    expect(text).toMatch(/au clavier n'est pas copiée/);
    expect(text.indexOf("Copier automatiquement")).toBeGreaterThan(text.indexOf("Copier-coller"));
  });
});
