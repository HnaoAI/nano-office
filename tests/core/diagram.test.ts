// Schémas (T2.20) : données d'un schéma relues sans confiance, enregistrées dans `content` et dans le
// Y.Doc sans changement de version, dessin SVG, textes hors du compte des mots.
import { describe, expect, it } from "vitest";
import {
  anchorPoint,
  chosenHeight,
  contentBounds,
  diagramDescription,
  diagramFill,
  diagramHeight,
  DIAGRAM_MIN_HEIGHT,
  readDiagram,
  snap,
  wrapText,
  type DiagramData,
} from "../../src/core/diagram";
import { diagramToSvg, escapeXml } from "../../src/core/diagramSvg";
import { contentOf, parseDocument, serializeDocument } from "../../src/core/fileFormat";
import { documentSchema } from "../../src/core/schema";
import { NANO_FORMAT_VERSION, type DocumentJson } from "../../src/core/types";
import { nodeStats } from "../../src/core/wordCount";
import { jsonFromYdoc, ydocFromJson } from "./helpers";

/** Processus « Commande, Paiement, Livraison » avec un losange « Payé ? » (vérification manuelle). */
const PROCESS: DiagramData = {
  shapes: [
    {
      id: "s-1",
      kind: "rounded",
      x: 20,
      y: 20,
      width: 160,
      height: 60,
      text: "Commande",
      fill: null,
    },
    {
      id: "s-2",
      kind: "diamond",
      x: 240,
      y: 10,
      width: 140,
      height: 100,
      text: "Payé ?",
      fill: "#FFF176",
    },
    {
      id: "s-3",
      kind: "rectangle",
      x: 440,
      y: 20,
      width: 160,
      height: 60,
      text: "Livraison 🚚\nà domicile",
      fill: null,
    },
    {
      id: "s-4",
      kind: "circle",
      x: 260,
      y: 160,
      width: 100,
      height: 100,
      text: "Relance",
      fill: "#B3E5FC",
    },
  ],
  arrows: [
    { id: "a-1", from: "s-1", fromSide: "right", to: "s-2", toSide: "left", text: "" },
    { id: "a-2", from: "s-2", fromSide: "right", to: "s-3", toSide: "left", text: "oui" },
    { id: "a-3", from: "s-2", fromSide: "bottom", to: "s-4", toSide: "top", text: "non" },
  ],
};

function diagramJson(id: string, data: DiagramData, height: number | null = null): DocumentJson {
  return { type: "diagram", attrs: { id, shapes: data.shapes, arrows: data.arrows, height } };
}

function para(id: string, text: string): DocumentJson {
  return { type: "paragraph", attrs: { id }, content: [{ type: "text", text }] };
}

const DOCUMENT: DocumentJson = {
  type: "doc",
  content: [
    para("p-1", "Le processus de Zoé."),
    diagramJson("d-1", PROCESS, 300),
    para("p-2", "Fin."),
  ],
};

describe("T2.20 : schémas, données du bloc", () => {
  it("critère 7 : le schéma est un bloc du document avec son identifiant, à côté des paragraphes", () => {
    const doc = documentSchema.nodeFromJSON(DOCUMENT);
    doc.check();
    const node = doc.child(1);
    expect(node.type.name).toBe("diagram");
    expect(node.isAtom).toBe(true);
    expect(node.attrs.id).toBe("d-1");
  });

  it("critère 7 : un schéma ne se place jamais dans une liste, un tableau ou un encadré", () => {
    const inCell: DocumentJson = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [{ type: "tableCell", content: [diagramJson("d-1", PROCESS)] }],
            },
          ],
        },
      ],
    };
    expect(() => documentSchema.nodeFromJSON(inCell).check()).toThrow();
    const inCallout: DocumentJson = {
      type: "doc",
      content: [{ type: "callout", content: [diagramJson("d-1", PROCESS)] }],
    };
    expect(() => documentSchema.nodeFromJSON(inCallout).check()).toThrow();
  });

  it("critère 7 : formes et flèches (accents, emojis) gardées dans content et dans le Y.Doc, sans changement de version", () => {
    const ydoc = ydocFromJson(DOCUMENT);
    const text = serializeDocument({ id: "doc-1", ydoc });
    const file = JSON.parse(text) as { version: number; content: DocumentJson };
    expect(file.version).toBe(NANO_FORMAT_VERSION);
    expect(file.content.content?.[1]).toEqual(diagramJson("d-1", PROCESS, 300));
    const result = parseDocument(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(contentOf(result.ydoc).content?.[1]).toEqual(diagramJson("d-1", PROCESS, 300));
    expect(jsonFromYdoc(result.ydoc).content?.[1]).toEqual(diagramJson("d-1", PROCESS, 300));
  });

  it("critère 7 : un schéma vide s'enregistre et se rouvre vide", () => {
    const empty: DocumentJson = {
      type: "doc",
      content: [diagramJson("d-0", { shapes: [], arrows: [] })],
    };
    const result = parseDocument(serializeDocument({ id: "doc-0", ydoc: ydocFromJson(empty) }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const node = contentOf(result.ydoc).content?.[0];
    expect(readDiagram(node?.attrs)).toEqual({ shapes: [], arrows: [] });
  });

  it("critère 7 : un document sans schéma s'enregistre comme avant", () => {
    const plain: DocumentJson = { type: "doc", content: [para("p-1", "Bonjour")] };
    const text = serializeDocument({ id: "doc-2", ydoc: ydocFromJson(plain) });
    expect(text).not.toContain("diagram");
  });

  it("critère 7 : des données modifiées à la main sont relues sans planter", () => {
    const data = readDiagram({
      shapes: [
        { id: "ok", kind: "circle", x: -50, y: "12", width: 1e9, height: 5, text: 42, fill: "red" },
        { id: "ok", kind: "rectangle" },
        { id: "", kind: "rectangle" },
        { id: "x", kind: "étoile" },
        null,
        "texte",
      ],
      arrows: [
        { id: "a", from: "ok", to: "absente" },
        { id: "b", from: "ok", to: "ok", fromSide: "dessous", toSide: "left", text: "<b>" },
        { id: "b", from: "ok", to: "ok" },
      ],
    });
    expect(data.shapes).toHaveLength(1);
    expect(data.shapes[0]).toMatchObject({
      id: "ok",
      kind: "circle",
      x: 0,
      y: 0,
      text: "",
      fill: null,
    });
    expect(data.shapes[0]?.width).toBeLessThanOrEqual(20_000);
    expect(data.shapes[0]?.height).toBeGreaterThanOrEqual(30);
    expect(data.arrows).toEqual([
      { id: "b", from: "ok", fromSide: "bottom", to: "ok", toSide: "left", text: "<b>" },
    ]);
    expect(readDiagram(undefined)).toEqual({ shapes: [], arrows: [] });
    expect(readDiagram({ shapes: "rien", arrows: 3 })).toEqual({ shapes: [], arrows: [] });
  });

  it("critère 5 : le fond est une couleur de surlignage de la palette, sinon blanc", () => {
    expect(diagramFill("#fff176")).toBe("#FFF176");
    expect(diagramFill("#C5E1A5")).toBe("#C5E1A5");
    expect(diagramFill("red; stroke: url(javascript:1)")).toBeNull();
    expect(diagramFill(null)).toBeNull();
  });

  it("critère 6 : la hauteur suit le contenu, et la hauteur choisie ne la réduit jamais", () => {
    expect(diagramHeight({ shapes: [], arrows: [] }, null)).toBe(DIAGRAM_MIN_HEIGHT);
    expect(diagramHeight(PROCESS, null)).toBe(280);
    expect(diagramHeight(PROCESS, 500)).toBe(500);
    expect(diagramHeight(PROCESS, 100)).toBe(280);
    expect(chosenHeight("abc")).toBeNull();
    expect(chosenHeight(1e9)).toBe(4000);
  });

  it("critère 4 : grille magnétique de 10 px", () => {
    expect(snap(14)).toBe(10);
    expect(snap(15)).toBe(20);
    expect(snap(0)).toBe(0);
  });

  it("critère 3 : une flèche s'accroche au milieu d'un côté, et suit la forme déplacée", () => {
    const shape = PROCESS.shapes[1];
    if (!shape) throw new Error("forme absente");
    expect(anchorPoint(shape, "left")).toEqual({ x: 240, y: 60 });
    expect(anchorPoint({ ...shape, x: 300 }, "left")).toEqual({ x: 300, y: 60 });
    expect(anchorPoint(shape, "bottom")).toEqual({ x: 310, y: 110 });
  });

  it("critère 2 : le texte d'une forme se coupe aux retours à la ligne et entre les mots", () => {
    const measure = (value: string) => value.length * 10;
    expect(wrapText("Livraison\nà domicile", 1000, measure)).toEqual(["Livraison", "à domicile"]);
    expect(wrapText("un deux trois", 80, measure)).toEqual(["un deux", "trois"]);
    expect(wrapText("anticonstitutionnellement", 100, measure)).toEqual([
      "anticonsti",
      "tutionnell",
      "ement",
    ]);
    expect(wrapText("", 100, measure)).toEqual([""]);
    expect(wrapText("😀😀😀", 20, measure)).toEqual(["😀", "😀", "😀"]);
  });
});

describe("T2.20 : dessin SVG", () => {
  it("critère 8 : le SVG dessine chaque forme, chaque flèche avec sa pointe et chaque texte", () => {
    const svg = diagramToSvg(PROCESS, { height: 280, idPrefix: "d-1" });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('width="100%"');
    expect(svg.match(/<g data-shape-id=/g)).toHaveLength(4);
    expect(svg.match(/<line /g)).toHaveLength(3);
    expect(svg.match(/marker-end="url\(#d-1-arrow\)"/g)).toHaveLength(3);
    expect(svg).toContain("<rect");
    expect(svg).toContain("<ellipse");
    expect(svg).toContain("<polygon");
    for (const label of [
      "Commande",
      "Payé ?",
      "Livraison 🚚",
      "à domicile",
      "Relance",
      "oui",
      "non",
    ]) {
      expect(svg).toContain(`>${label}<`);
    }
    expect(svg).toContain('fill="#FFF176"');
  });

  it("critère 8 : les textes sont protégés, un texte ne peut pas ajouter d'élément au dessin", () => {
    const data: DiagramData = {
      shapes: [
        {
          id: 'x"><script>',
          kind: "rectangle",
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: "<script>alert(1)</script> & co",
          fill: null,
        },
      ],
      arrows: [],
    };
    const svg = diagramToSvg(data, { height: 100 });
    expect(svg).not.toContain("<script");
    expect(svg).toContain("&lt;script&gt;");
    expect(escapeXml(`<"'&>`)).toBe("&lt;&quot;&#39;&amp;&gt;");
  });

  it("critère 9 : l'image Word ne garde que le cadre des formes", () => {
    const svg = diagramToSvg(PROCESS, { height: 280, cropPadding: 10 });
    expect(svg).toContain('viewBox="10 0 600 270"');
    expect(svg).toContain('width="600"');
    expect(contentBounds({ shapes: [], arrows: [] })).toBeNull();
  });

  it("critère 13 : le schéma a un nom accessible qui liste ses textes", () => {
    expect(diagramDescription(PROCESS)).toBe(
      "Schéma : Commande, Payé ?, Livraison 🚚 à domicile, Relance, oui, non",
    );
    expect(diagramDescription({ shapes: [], arrows: [] })).toBe("Schéma vide");
    expect(diagramToSvg(PROCESS, { height: 280 })).toContain('aria-label="Schéma : Commande');
  });

  it("critère 8 : un schéma vide donne un dessin sans forme", () => {
    const svg = diagramToSvg({ shapes: [], arrows: [] }, { height: 160 });
    expect(svg).not.toContain("data-shape-id");
    expect(svg).toContain('height="160"');
  });
});

describe("T2.20 : mots", () => {
  it("critère 10 : les textes des formes ne comptent pas dans le nombre de mots", () => {
    const doc = documentSchema.nodeFromJSON(DOCUMENT);
    expect(nodeStats(doc.child(1)).words).toBe(0);
    expect(nodeStats(doc.child(0)).words).toBe(4);
  });
});
