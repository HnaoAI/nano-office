// Plan du document (T2.9) : lignes du plan, calcul des parties (niveaux imbriqués, document sans titre,
// saut de page), déplacement avant et après, déplacement au clavier, identifiants gardés.
import { describe, expect, it } from "vitest";
import { EditorState } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  activeHeading,
  canMoveSection,
  documentOutline,
  entryKey,
  moveSection,
  neighbourTarget,
  sameOutline,
  sectionRange,
  topBlockPos,
} from "../../src/core/outline";
import { documentSchema } from "../../src/core/schema";
import type { DocumentJson } from "../../src/core/types";

function text(value: string): DocumentJson {
  return { type: "text", text: value };
}

function para(id: string, value = `Texte ${id}, été 🌾`): DocumentJson {
  return { type: "paragraph", attrs: { id }, content: [text(value)] };
}

function heading(id: string, level: number, value = id): DocumentJson {
  return { type: "heading", attrs: { id, level }, content: [text(value)] };
}

const IMAGE = (id: string): DocumentJson => ({
  type: "image",
  attrs: { id, hash: "a".repeat(64), alt: "Photo" },
});

const PAGE_BREAK = (id: string): DocumentJson => ({ type: "pageBreak", attrs: { id } });

function table(id: string): DocumentJson {
  return {
    type: "table",
    content: [0, 1].map((row) => ({
      type: "tableRow",
      content: [0, 1].map((col) => ({
        type: "tableCell",
        attrs: { id: `${id}-c-${row}-${col}` },
        content: [para(`${id}-p-${row}-${col}`)],
      })),
    })),
  };
}

function list(id: string): DocumentJson {
  return {
    type: "bulletList",
    content: [0, 1].map((index) => ({
      type: "listItem",
      attrs: { id: `${id}-li-${index}` },
      content: [para(`${id}-p-${index}`)],
    })),
  };
}

function doc(...content: DocumentJson[]): ProseMirrorNode {
  return documentSchema.nodeFromJSON({ type: "doc", content });
}

/** Identifiants des blocs de premier niveau, ou type du bloc s'il n'en a pas (liste, tableau). */
function topIds(node: ProseMirrorNode): string[] {
  const ids: string[] = [];
  node.forEach((child) => ids.push((child.attrs.id as string | undefined) ?? child.type.name));
  return ids;
}

/** Tous les identifiants de blocs du document, cellules et éléments de liste compris. */
function allIds(node: ProseMirrorNode): string[] {
  const ids: string[] = [];
  node.descendants((child) => {
    if (typeof child.attrs.id === "string") ids.push(child.attrs.id);
  });
  return ids;
}

function posOf(node: ProseMirrorNode, id: string): number {
  const pos = topBlockPos(node, { id, index: -1 });
  if (pos === null) throw new Error(`bloc ${id} absent`);
  return pos;
}

/** Déplace la partie du titre `id` avant le bloc `beforeId` (ou à la fin), et renvoie le document. */
function move(node: ProseMirrorNode, id: string, beforeId: string | null): ProseMirrorNode | null {
  const range = sectionRange(node, posOf(node, id));
  if (!range) throw new Error("pas de partie");
  const target = beforeId === null ? node.content.size : posOf(node, beforeId);
  const tr = EditorState.create({ doc: node }).tr;
  return moveSection(tr, range, target) === null ? null : tr.doc;
}

/** Exposé de trois parties de Titre 1, la deuxième avec deux sous-parties. */
const EXPOSE = doc(
  para("intro"),
  heading("h1-a", 1, "Le vent"),
  para("a-1"),
  heading("h1-b", 1, "Les cerfs-volants"),
  para("b-1"),
  heading("h2-b1", 2, "Histoire"),
  para("b1-1"),
  list("l"),
  heading("h3-b1", 3, "En Chine"),
  para("b1-2"),
  heading("h2-b2", 2, "Fabrication"),
  table("t"),
  IMAGE("img"),
  heading("h1-c", 1, "Conclusion"),
  para("c-1"),
  PAGE_BREAK("pb"),
  para("c-2"),
);

describe("T2.9 : plan du document", () => {
  it("critère 2 : le plan liste les titres 1, 2 et 3 avec leur niveau, et les sauts de page", () => {
    const outline = documentOutline(EXPOSE);
    expect(
      outline.map((entry) =>
        entry.kind === "heading" ? `${String(entry.level)} ${entry.text}` : "saut",
      ),
    ).toEqual([
      "1 Le vent",
      "1 Les cerfs-volants",
      "2 Histoire",
      "3 En Chine",
      "2 Fabrication",
      "1 Conclusion",
      "saut",
    ]);
    expect(outline.map((entry) => entry.id)).toEqual([
      "h1-a",
      "h1-b",
      "h2-b1",
      "h3-b1",
      "h2-b2",
      "h1-c",
      "pb",
    ]);
  });

  it("critère 2 : un document sans titre a un plan vide", () => {
    expect(documentOutline(doc(para("p-1"), para("p-2")))).toEqual([]);
    expect(documentOutline(doc({ type: "paragraph" }))).toEqual([]);
  });

  it("cas limite : un titre dans une cellule de tableau n'est pas une partie", () => {
    const inCell = doc(para("p"), {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableCell", attrs: { id: "c" }, content: [heading("h-cell", 1, "Dans")] },
          ],
        },
      ],
    });
    expect(documentOutline(inCell)).toEqual([]);
  });

  it("cas limite : un titre vide, accentué ou avec emoji garde son texte", () => {
    const outline = documentOutline(
      doc({ type: "heading", attrs: { id: "vide", level: 1 } }, heading("e", 2, "Été 🌾 « ok »")),
    );
    expect(outline).toMatchObject([
      { kind: "heading", text: "" },
      { kind: "heading", text: "Été 🌾 « ok »" },
    ]);
  });

  it("critère 7 : deux plans identiques sont reconnus, un texte changé ne l'est pas", () => {
    expect(sameOutline(documentOutline(EXPOSE), documentOutline(EXPOSE))).toBe(true);
    const renamed = doc(heading("h1-a", 1, "Le vent !"));
    expect(
      sameOutline(documentOutline(doc(heading("h1-a", 1, "Le vent"))), documentOutline(renamed)),
    ).toBe(false);
    const relevel = doc(heading("h1-a", 2, "Le vent"));
    expect(
      sameOutline(documentOutline(doc(heading("h1-a", 1, "Le vent"))), documentOutline(relevel)),
    ).toBe(false);
  });

  it("critère 4 : une partie va jusqu'au titre suivant de même niveau ou de niveau supérieur", () => {
    const end = (id: string) => {
      const range = sectionRange(EXPOSE, posOf(EXPOSE, id));
      return range && topIds(EXPOSE.cut(range.from, range.to));
    };
    expect(end("h1-a")).toEqual(["h1-a", "a-1"]);
    expect(end("h1-b")).toEqual([
      "h1-b",
      "b-1",
      "h2-b1",
      "b1-1",
      "bulletList",
      "h3-b1",
      "b1-2",
      "h2-b2",
      "table",
      "img",
    ]);
    expect(end("h2-b1")).toEqual(["h2-b1", "b1-1", "bulletList", "h3-b1", "b1-2"]);
    expect(end("h3-b1")).toEqual(["h3-b1", "b1-2"]);
    expect(end("h2-b2")).toEqual(["h2-b2", "table", "img"]);
    // La dernière partie va jusqu'à la fin, saut de page compris.
    expect(end("h1-c")).toEqual(["h1-c", "c-1", "pb", "c-2"]);
  });

  it("critère 4 : un bloc qui n'est pas un titre n'a pas de partie", () => {
    expect(sectionRange(EXPOSE, posOf(EXPOSE, "intro"))).toBeNull();
    expect(sectionRange(EXPOSE, posOf(EXPOSE, "pb"))).toBeNull();
  });

  it("critère 3 : le titre actif est celui de la partie où se trouve le curseur", () => {
    expect(activeHeading(EXPOSE, posOf(EXPOSE, "intro") + 2)).toBeNull();
    expect(activeHeading(EXPOSE, posOf(EXPOSE, "h1-a") + 1)).toBe("h1-a");
    expect(activeHeading(EXPOSE, posOf(EXPOSE, "b1-2") + 3)).toBe("h3-b1");
    expect(activeHeading(EXPOSE, posOf(EXPOSE, "img"))).toBe("h2-b2");
    expect(activeHeading(EXPOSE, EXPOSE.content.size)).toBe("h1-c");
  });

  it("critère 3 : sans identifiant, une ligne est retrouvée par sa place", () => {
    const noIds = doc(para("p"), { type: "heading", attrs: { level: 1 }, content: [text("Sans")] });
    const [entry] = documentOutline(noIds);
    expect(entry).toMatchObject({ id: null, index: 1 });
    if (!entry) throw new Error("ligne absente");
    expect(entryKey(entry)).toBe("#1");
    expect(topBlockPos(noIds, entry)).toBe(noIds.child(0).nodeSize);
    expect(activeHeading(noIds, noIds.content.size)).toBe("#1");
  });

  it("critère 4 : faire passer la troisième partie en premier", () => {
    const moved = move(EXPOSE, "h1-c", "h1-a");
    expect(moved && topIds(moved)).toEqual([
      "intro",
      "h1-c",
      "c-1",
      "pb",
      "c-2",
      "h1-a",
      "a-1",
      "h1-b",
      "b-1",
      "h2-b1",
      "b1-1",
      "bulletList",
      "h3-b1",
      "b1-2",
      "h2-b2",
      "table",
      "img",
    ]);
  });

  it("critère 4 : déplacer une partie après la suivante, et à la fin du document", () => {
    const after = move(EXPOSE, "h1-a", "h1-c");
    expect(after && topIds(after).slice(0, 4)).toEqual(["intro", "h1-b", "b-1", "h2-b1"]);
    expect(after && topIds(after).slice(-6)).toEqual(["h1-a", "a-1", "h1-c", "c-1", "pb", "c-2"]);
    const atEnd = move(EXPOSE, "h1-a", null);
    expect(atEnd && topIds(atEnd).slice(-2)).toEqual(["h1-a", "a-1"]);
  });

  it("critère 4 : une sous-partie emporte ses sous-titres, sa liste, son tableau et son image", () => {
    const moved = move(EXPOSE, "h2-b2", "h2-b1");
    expect(moved && topIds(moved).slice(4, 13)).toEqual([
      "b-1",
      "h2-b2",
      "table",
      "img",
      "h2-b1",
      "b1-1",
      "bulletList",
      "h3-b1",
      "b1-2",
    ]);
  });

  it("critère 4 : poser une partie sur place ou à l'intérieur d'elle-même ne fait rien", () => {
    expect(move(EXPOSE, "h1-b", "h1-b")).toBeNull();
    expect(move(EXPOSE, "h1-b", "h2-b1")).toBeNull();
    expect(move(EXPOSE, "h1-b", "h1-c")).toBeNull();
    expect(move(EXPOSE, "h1-c", null)).toBeNull();
    const range = sectionRange(EXPOSE, posOf(EXPOSE, "h1-b"));
    if (!range) throw new Error("pas de partie");
    expect(canMoveSection(range, range.from)).toBe(false);
    expect(canMoveSection(range, range.to)).toBe(false);
    expect(canMoveSection(range, range.from - 1)).toBe(true);
  });

  it("critère 6 : les identifiants sont gardés, rien n'est dupliqué ni perdu, images et tableaux compris", () => {
    const before = allIds(EXPOSE).sort();
    for (const [id, beforeId] of [
      ["h1-c", "h1-a"],
      ["h1-b", null],
      ["h2-b2", "h2-b1"],
      ["h1-a", "h2-b2"],
    ] as const) {
      const moved = move(EXPOSE, id, beforeId);
      if (!moved) throw new Error(`${id} n'a pas bougé`);
      expect(allIds(moved).sort()).toEqual(before);
      expect(moved.textContent.length).toBe(EXPOSE.textContent.length);
      // L'image garde son empreinte : elle n'est ni copiée ni perdue.
      const images: unknown[] = [];
      moved.descendants((node) => {
        if (node.type.name === "image") images.push(node.attrs.hash);
      });
      expect(images).toEqual(["a".repeat(64)]);
    }
  });

  it("critère 4 : au clavier, une partie passe avant la précédente ou après la suivante de même niveau", () => {
    const target = (id: string, direction: "up" | "down") => {
      const range = sectionRange(EXPOSE, posOf(EXPOSE, id));
      if (!range) throw new Error("pas de partie");
      return neighbourTarget(EXPOSE, range, direction);
    };
    expect(target("h1-b", "up")).toBe(posOf(EXPOSE, "h1-a"));
    expect(target("h1-b", "down")).toBe(EXPOSE.content.size);
    expect(target("h1-a", "down")).toBe(posOf(EXPOSE, "h1-c"));
    expect(target("h2-b2", "up")).toBe(posOf(EXPOSE, "h2-b1"));
    expect(target("h2-b1", "down")).toBe(posOf(EXPOSE, "h1-c"));
  });

  it("critère 4 : au clavier, la première et la dernière partie de leur niveau ne bougent pas", () => {
    const target = (id: string, direction: "up" | "down") => {
      const range = sectionRange(EXPOSE, posOf(EXPOSE, id));
      if (!range) throw new Error("pas de partie");
      return neighbourTarget(EXPOSE, range, direction);
    };
    expect(target("h1-a", "up")).toBeNull();
    expect(target("h1-c", "down")).toBeNull();
    // Un sous-titre ne change jamais de partie parente au clavier.
    expect(target("h2-b1", "up")).toBeNull();
    expect(target("h2-b2", "down")).toBeNull();
    expect(target("h3-b1", "up")).toBeNull();
    expect(target("h3-b1", "down")).toBeNull();
  });

  it("cas limite : 200 titres sont listés et déplacés rapidement", () => {
    const content: DocumentJson[] = [];
    for (let index = 0; index < 200; index += 1) {
      content.push(
        heading(`h-${index}`, (index % 3) + 1, `Partie ${index} 🌾`),
        para(`p-${index}`),
      );
    }
    const big = doc(...content);
    const started = performance.now();
    for (let round = 0; round < 50; round += 1) documentOutline(big);
    expect(documentOutline(big)).toHaveLength(200);
    const moved = move(big, "h-198", "h-0");
    expect(moved && topIds(moved).slice(0, 2)).toEqual(["h-198", "p-198"]);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
