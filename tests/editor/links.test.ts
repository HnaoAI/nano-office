// @vitest-environment jsdom
// Tests des liens (T2.12) dans jsdom : poser, modifier et retirer un lien, adresses refusées, aucun lien à la
// frappe, collage d'une adresse sur une sélection, collages interne et extérieur, Ctrl/Cmd+clic, Ctrl/Cmd+K.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import { documentSchema } from "../../src/core/schema";
import type { DocumentJson } from "../../src/core/types";
import { FormatShortcuts, formatShortcuts } from "../../src/editor/keyboardShortcuts";
import {
  applyLink,
  currentLink,
  LinkClick,
  removeLink,
  setLinkRequestHandler,
} from "../../src/editor/links";
import { copyAll, createTestEditor, docOf, pasteHtml, textNode } from "./editorHelpers";

let editor: Editor | null = null;

const EMPTY: DocumentJson = { type: "doc", content: [{ type: "paragraph", attrs: { id: "p-1" } }] };

/** Colle du texte brut par le chemin de ProseMirror (jsdom n'a pas de ClipboardEvent). */
function pasteText(target: Editor, text: string) {
  target.view.pasteText(text, new Event("paste") as ClipboardEvent);
}

afterEach(() => {
  editor?.destroy();
  editor = null;
  vi.restoreAllMocks();
});

function start(content: DocumentJson = docOf(textNode("Voir le site de l'école"))): Editor {
  editor = createTestEditor(content, [FormatShortcuts, LinkClick]);
  return editor;
}

/** Sélectionne `fragment` dans le premier paragraphe. */
function select(target: Editor, fragment: string) {
  const index = target.state.doc.textContent.indexOf(fragment);
  if (index < 0) throw new Error(`texte absent : ${fragment}`);
  target.commands.setTextSelection({ from: index + 1, to: index + 1 + fragment.length });
}

/** Morceaux de texte du document et adresse de leur lien. */
function links(target: Editor): [string, string | null][] {
  const result: [string, string | null][] = [];
  target.state.doc.descendants((node) => {
    if (node.isText) {
      const mark = node.marks.find((candidate) => candidate.type.name === "link");
      result.push([node.text ?? "", (mark?.attrs.href as string | undefined) ?? null]);
    }
    return true;
  });
  return result;
}

describe("T2.12 : liens", () => {
  it("critère 7 : le schéma connaît la marque « link », qui ne garde que son adresse", () => {
    expect(documentSchema.marks.link).toBeDefined();
    expect(Object.keys(documentSchema.marks.link?.spec.attrs ?? {})).toEqual(["href"]);
  });

  it("critère 1 : sur le texte sélectionné, l'adresse sans https:// le reçoit", () => {
    const target = start();
    select(target, "le site");
    expect(applyLink(target, "ecole.fr")).toBe("linked");
    expect(links(target)).toEqual([
      ["Voir ", null],
      ["le site", "https://ecole.fr"],
      [" de l'école", null],
    ]);
  });

  it("critère 1 : sans sélection, l'adresse est insérée comme texte du lien ; un e-mail devient mailto:", () => {
    const target = start(docOf(textNode("Écrire à ")));
    target.commands.setTextSelection(target.state.doc.content.size - 1);
    applyLink(target, "mamie@exemple.fr");
    expect(links(target)).toEqual([
      ["Écrire à ", null],
      ["mamie@exemple.fr", "mailto:mamie@exemple.fr"],
    ]);
    // Le texte tapé ensuite ne fait pas partie du lien.
    target.commands.insertContent(" merci");
    expect(links(target).at(-1)).toEqual([" merci", null]);
  });

  it("critère 1 : le curseur dans un lien modifie son adresse", () => {
    const target = start(
      docOf(
        textNode("Voir "),
        textNode("le site", { type: "link", attrs: { href: "https://a.fr" } }),
      ),
    );
    target.commands.setTextSelection(8);
    expect(currentLink(target.state)?.href).toBe("https://a.fr");
    applyLink(target, "https://b.fr");
    expect(links(target)).toEqual([
      ["Voir ", null],
      ["le site", "https://b.fr"],
    ]);
  });

  it("critère 2 : javascript:, data: et les autres adresses sont refusées dans la fenêtre", () => {
    const target = start();
    select(target, "le site");
    for (const refused of ["javascript:alert(1)", "data:text/html,x", "file:///c:/", "bonjour"]) {
      expect(applyLink(target, refused)).toBe("refused");
    }
    expect(links(target).every(([, href]) => href === null)).toBe(true);
  });

  it("critère 2 : un collage extérieur garde les liens http, https et mailto, jamais javascript: ni data:", () => {
    const target = start(EMPTY);
    pasteHtml(
      target,
      '<p><a href="https://exemple.fr">web</a> <a href="mailto:a@b.fr">mail</a> <a href="javascript:alert(1)">piège</a> <a href="data:text/html,x">données</a> <a href="JAVASCRIPT:alert(1)">piège2</a></p>',
    );
    const found = Object.fromEntries(links(target));
    expect(found.web).toBe("https://exemple.fr");
    expect(found.mail).toBe("mailto:a@b.fr");
    expect(found["piège"]).toBeUndefined();
    expect(JSON.stringify(target.getJSON())).not.toMatch(/javascript|data:text/i);
    expect(target.getText()).toContain("piège");
  });

  it("critère 3 : un lien s'affiche souligné en bleu #1565C0 et s'ouvre dans un nouvel onglet (noopener)", () => {
    const target = start(
      docOf(textNode("site", { type: "link", attrs: { href: "https://exemple.fr" } })),
    );
    const anchor = target.view.dom.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("https://exemple.fr");
    expect(anchor?.getAttribute("target")).toBe("_blank");
    expect(anchor?.getAttribute("rel")).toContain("noopener");
    expect(anchor?.getAttribute("style")).toMatch(/color: (#1565C0|rgb\(21, 101, 192\))/);
    expect(anchor?.getAttribute("style")).toContain("text-decoration: underline");
  });

  it("critère 3 : un clic place le curseur, un Ctrl+clic ouvre l'adresse", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const target = start(
      docOf(textNode("site", { type: "link", attrs: { href: "https://exemple.fr" } })),
    );
    const click = (init: MouseEventInit) =>
      target.view.someProp("handleClick", (handler) =>
        handler(target.view, 2, new MouseEvent("click", { button: 0, ...init })),
      );
    expect(click({})).toBeFalsy();
    expect(open).not.toHaveBeenCalled();
    expect(click({ ctrlKey: true })).toBe(true);
    expect(open).toHaveBeenCalledWith("https://exemple.fr", "_blank", "noopener,noreferrer");
  });

  it("critère 3 : « Retirer le lien » garde le texte", () => {
    const target = start(
      docOf(textNode("le site", { type: "link", attrs: { href: "https://exemple.fr" } })),
    );
    target.commands.setTextSelection(3);
    expect(removeLink(target)).toBe(true);
    expect(links(target)).toEqual([["le site", null]]);
  });

  it("critère 4 : taper une adresse ne crée pas de lien", () => {
    const target = start(EMPTY);
    target.commands.insertContent("Voir https://exemple.fr et www.ecole.fr ");
    expect(links(target).every(([, href]) => href === null)).toBe(true);
  });

  it("critère 4 : coller une adresse sur un texte sélectionné en fait un lien, pas une adresse refusée", () => {
    const target = start();
    select(target, "le site");
    pasteText(target, "https://exemple.fr");
    expect(links(target)).toContainEqual(["le site", "https://exemple.fr"]);
    select(target, "l'école");
    pasteText(target, "javascript:alert(1)");
    expect(JSON.stringify(target.getJSON())).not.toContain('"href":"javascript');
  });

  it("critère 4 : coller une adresse sans sélection la colle comme texte, sans lien", () => {
    const target = start(EMPTY);
    pasteText(target, "https://exemple.fr");
    expect(links(target)).toEqual([["https://exemple.fr", null]]);
  });

  it("critère 5 : gardés dans un copier-coller interne", () => {
    const source = start(
      docOf(
        textNode("Voir "),
        textNode("le site", { type: "link", attrs: { href: "https://exemple.fr" } }),
      ),
    );
    const { html } = copyAll(source);
    const target = createTestEditor();
    pasteHtml(target, html);
    expect(links(target)).toContainEqual(["le site", "https://exemple.fr"]);
    target.destroy();
  });

  it("critère 1 : Ctrl/Cmd+K, à la touche physique, demande la fenêtre « Lien »", () => {
    for (const mac of [true, false]) {
      expect(formatShortcuts(mac).find((shortcut) => shortcut.label === "Lien")).toMatchObject({
        code: "KeyK",
        mod: true,
      });
    }
    const target = start();
    const handler = vi.fn();
    setLinkRequestHandler(target, handler);
    const event = new KeyboardEvent("keydown", { code: "KeyK", key: "k", ctrlKey: true });
    target.view.someProp("handleKeyDown", (keyDown) => keyDown(target.view, event));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("critère 2 : un lien mailto mal encodé, collé ou lu dans un fichier, reste du texte sans plantage", () => {
    const target = start(EMPTY);
    expect(() =>
      pasteHtml(target, '<p><a href="mailto:caf%E9@exemple.fr">la mairie</a></p>'),
    ).not.toThrow();
    expect(links(target)).toEqual([["la mairie", null]]);
    const reopened = createTestEditor(
      docOf(textNode("la mairie", { type: "link", attrs: { href: "mailto:caf%E9@exemple.fr" } })),
    );
    expect(reopened.state.doc.textContent).toBe("la mairie");
    reopened.destroy();
  });

  it("critère 5 : un lien collé, ici ou depuis le web, n'est pas souligné en plus", () => {
    const source = start(
      docOf(textNode("le site", { type: "link", attrs: { href: "https://exemple.fr" } })),
    );
    const { html } = copyAll(source);
    const inside = createTestEditor();
    pasteHtml(inside, html);
    const outside = createTestEditor();
    pasteHtml(
      outside,
      '<p><a href="https://exemple.fr" style="text-decoration: underline">le site</a></p>',
    );
    for (const target of [inside, outside]) {
      let names: string[] = [];
      target.state.doc.descendants((node) => {
        if (node.isText) names = node.marks.map((mark) => mark.type.name);
        return true;
      });
      expect(names).toEqual(["link"]);
      target.destroy();
    }
  });
});
