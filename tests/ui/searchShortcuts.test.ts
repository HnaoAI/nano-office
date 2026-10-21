// @vitest-environment jsdom
// Raccourcis de la barre de recherche (src/ui/useSearchShortcuts.ts, T2.1, critères 1 et 4).
import { describe, expect, it } from "vitest";
import { searchShortcut } from "../../src/ui/useSearchShortcuts";

function key(code: string, modifiers: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", { code, ...modifiers });
}

describe("T2.1 : raccourcis de recherche", () => {
  it("Windows : Ctrl+F recherche, Ctrl+H remplace", () => {
    expect(searchShortcut(key("KeyF", { ctrlKey: true }), false)).toBe("find");
    expect(searchShortcut(key("KeyH", { ctrlKey: true }), false)).toBe("replace");
  });

  it("Windows : AltGr (Ctrl+Alt) et Ctrl+Shift n'ouvrent rien", () => {
    expect(searchShortcut(key("KeyF", { ctrlKey: true, altKey: true }), false)).toBeNull();
    expect(searchShortcut(key("KeyH", { ctrlKey: true, altKey: true }), false)).toBeNull();
    expect(searchShortcut(key("KeyF", { ctrlKey: true, shiftKey: true }), false)).toBeNull();
  });

  it("Mac : Cmd+F recherche, Cmd+Option+F remplace, Cmd+H et Ctrl+F n'ouvrent rien", () => {
    expect(searchShortcut(key("KeyF", { metaKey: true }), true)).toBe("find");
    expect(searchShortcut(key("KeyF", { metaKey: true, altKey: true }), true)).toBe("replace");
    expect(searchShortcut(key("KeyH", { metaKey: true }), true)).toBeNull();
    expect(searchShortcut(key("KeyF", { ctrlKey: true }), true)).toBeNull();
  });

  it("reconnu à la touche physique, quel que soit le caractère produit", () => {
    expect(
      searchShortcut(
        new KeyboardEvent("keydown", { code: "KeyF", key: "ф", ctrlKey: true }),
        false,
      ),
    ).toBe("find");
  });
});
