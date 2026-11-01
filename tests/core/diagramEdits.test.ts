// Schémas (T2.20) : actions de l'éditeur de formes (ajouter, relier, déplacer, écrire, colorer,
// supprimer, copier et coller), puis export Word en image.
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { DiagramData } from "../../src/core/diagram";
import {
  addShape,
  connect,
  copyItems,
  pasteItems,
  placeShapes,
  removeItems,
  setFill,
  setText,
} from "../../src/core/diagramEdits";
import { DEFAULT_PAGE_SETUP } from "../../src/core/pageSetup";
import type { DocumentJson } from "../../src/core/types";
import { diagramImageKey, type WordImage } from "../../src/core/wordBlocks";
import { exportWord } from "../../src/core/wordExport";

function ids(): () => string {
  let next = 0;
  return () => `n-${(next += 1)}`;
}

const TWO: DiagramData = {
  shapes: [
    {
      id: "a",
      kind: "rectangle",
      x: 20,
      y: 20,
      width: 160,
      height: 60,
      text: "Commande",
      fill: null,
    },
    {
      id: "b",
      kind: "diamond",
      x: 240,
      y: 20,
      width: 140,
      height: 100,
      text: "Payé ?",
      fill: null,
    },
  ],
  arrows: [{ id: "ab", from: "a", fromSide: "right", to: "b", toSide: "left", text: "" }],
};

describe("T2.20 : actions sur un schéma", () => {
  it("critère 2 : une forme ajoutée se place à droite de la précédente, puis sur une nouvelle ligne", () => {
    const newId = ids();
    let data: DiagramData = { shapes: [], arrows: [] };
    const first = addShape(data, "rectangle", 640, newId);
    data = first.data;
    expect(data.shapes[0]).toMatchObject({
      id: "n-1",
      x: 20,
      y: 20,
      width: 160,
      height: 60,
      text: "",
    });
    data = addShape(data, "circle", 640, newId).data;
    expect(data.shapes[1]).toMatchObject({ x: 220, y: 20, width: 100, height: 100 });
    data = addShape(data, "diamond", 640, newId).data;
    expect(data.shapes[2]).toMatchObject({ x: 360, y: 20 });
    data = addShape(data, "rounded", 640, newId).data;
    expect(data.shapes[3]).toMatchObject({ x: 20, y: 160 });
  });

  it("critère 3 : une flèche relie deux formes, jamais une forme à elle-même ni deux fois", () => {
    const newId = ids();
    const data = connect(TWO, { from: "b", fromSide: "bottom", to: "a", toSide: "bottom" }, newId);
    expect(data.arrows).toHaveLength(2);
    expect(data.arrows[1]).toEqual({
      id: "n-1",
      from: "b",
      fromSide: "bottom",
      to: "a",
      toSide: "bottom",
      text: "",
    });
    expect(connect(TWO, { from: "a", fromSide: "top", to: "a", toSide: "left" }, newId)).toBe(TWO);
    expect(connect(TWO, { from: "a", fromSide: "right", to: "b", toSide: "left" }, newId)).toBe(
      TWO,
    );
    expect(connect(TWO, { from: "a", fromSide: "right", to: "zz", toSide: "left" }, newId)).toBe(
      TWO,
    );
  });

  it("critère 3 : une forme déplacée garde sa flèche", () => {
    const data = placeShapes(TWO, new Map([["b", { x: 300, y: 200 }]]));
    expect(data.shapes[1]).toMatchObject({ x: 300, y: 200, width: 140 });
    expect(data.arrows).toEqual(TWO.arrows);
    expect(placeShapes(TWO, new Map())).toBe(TWO);
    expect(placeShapes(TWO, new Map([["a", { x: -40 }]])).shapes[0]?.x).toBe(0);
  });

  it("critère 2 et 3 : le texte d'une forme (plusieurs lignes) et celui d'une flèche", () => {
    let data = setText(TWO, "a", "Bon de\ncommande 📦");
    data = setText(data, "ab", "oui");
    expect(data.shapes[0]?.text).toBe("Bon de\ncommande 📦");
    expect(data.arrows[0]?.text).toBe("oui");
  });

  it("critère 5 : le fond des formes choisies, pris dans les couleurs de surlignage", () => {
    expect(setFill(TWO, new Set(["a"]), "#C5E1A5").shapes.map((s) => s.fill)).toEqual([
      "#C5E1A5",
      null,
    ]);
    expect(setFill(TWO, new Set(["a", "b"]), "#123456").shapes.map((s) => s.fill)).toEqual([
      null,
      null,
    ]);
  });

  it("critère 3 et 4 : supprimer une forme supprime ses flèches ; une flèche se supprime seule", () => {
    expect(removeItems(TWO, new Set(["a"]), new Set())).toEqual({
      shapes: [TWO.shapes[1]],
      arrows: [],
    });
    expect(removeItems(TWO, new Set(), new Set(["ab"]))).toEqual({
      shapes: TWO.shapes,
      arrows: [],
    });
  });

  it("critère 4 : copier et coller des formes et la flèche qui les relie, décalées, avec de nouveaux identifiants", () => {
    const copied = copyItems(TWO, new Set(["a", "b"]));
    expect(copied.arrows).toHaveLength(1);
    expect(copyItems(TWO, new Set(["a"])).arrows).toHaveLength(0);
    const result = pasteItems(TWO, copied, ids());
    expect(result.ids).toEqual(["n-1", "n-2"]);
    expect(result.data.shapes).toHaveLength(4);
    expect(result.data.shapes[2]).toMatchObject({ id: "n-1", x: 40, y: 40, text: "Commande" });
    expect(result.data.arrows[1]).toMatchObject({ id: "n-3", from: "n-1", to: "n-2" });
  });
});

/** PNG minimal (1 × 1 pixel), pour l'image d'un schéma. */
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (char) => char.charCodeAt(0),
);

function diagramNode(id: string, data: DiagramData): DocumentJson {
  return { type: "diagram", attrs: { id, shapes: data.shapes, arrows: data.arrows, height: null } };
}

async function documentXml(content: DocumentJson[], images: Map<string, WordImage>) {
  const bytes = await exportWord({
    content: { type: "doc", content },
    pageSetup: DEFAULT_PAGE_SETUP,
    images,
    fonts: [],
  });
  const zip = await JSZip.loadAsync(bytes);
  return {
    xml: (await zip.file("word/document.xml")?.async("string")) ?? "",
    media: Object.keys(zip.files).filter(
      (name) => name.startsWith("word/media/") && !name.endsWith("/"),
    ),
  };
}

describe("T2.20 : export Word", () => {
  it("critère 9 : le schéma devient une image, avec un texte de remplacement qui liste les textes", async () => {
    const node = diagramNode("d-1", TWO);
    const key = diagramImageKey(node);
    expect(key).toBe("diagram:d-1");
    const image: WordImage = { type: "png", data: PNG, width: 380, height: 120 };
    const { xml, media } = await documentXml([node], new Map([[key ?? "", image]]));
    expect(media).toHaveLength(1);
    expect(xml).toContain('descr="Schéma : Commande, Payé ?"');
    expect(xml).toContain("<w:drawing>");
  });

  it("critère 9 : sans image, le texte de remplacement est écrit ; un schéma vide n'écrit rien", async () => {
    const { xml } = await documentXml([diagramNode("d-1", TWO)], new Map());
    expect(xml).toContain("Schéma : Commande, Payé ?");
    const empty = await documentXml([diagramNode("d-2", { shapes: [], arrows: [] })], new Map());
    expect(empty.xml).not.toContain("Schéma");
    expect(diagramImageKey({ type: "diagram", attrs: {} })).toBeNull();
  });
});
});
