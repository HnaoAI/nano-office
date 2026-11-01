// Tests d'interface du ticket T2.20 (schémas), dans Chromium : insertion, formes, flèches tirées entre
// deux points d'accroche, déplacement, texte, fond, annulation, sélection multiple et copier-coller,
// poignée du bas, réouverture, impression en SVG, export Word en image, recherche, mots, chargement
// à la demande de React Flow, clavier et rapidité.
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { DiagramData } from "../../src/core/diagram";
import { readDiagram } from "../../src/core/diagram";
import type { DocumentJson } from "../../src/core/types";
import {
  button,
  editor,
  saveAndReopen,
  settleSelection,
  start,
  topBlocks,
  waitUndoGroup,
} from "./formatHelpers";
import {
  exportDocx,
  fakeExportPicker,
  openDocument,
  pdfPagesText,
  printToPdf,
} from "./pageHelpers";

/** Processus de la vérification manuelle : Commande, Payé ?, Livraison, avec « oui » et « non ». */
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
      fill: null,
    },
    {
      id: "s-3",
      kind: "rectangle",
      x: 440,
      y: 20,
      width: 160,
      height: 60,
      text: "Livraison",
      fill: null,
    },
  ],
  arrows: [
    { id: "a-1", from: "s-1", fromSide: "right", to: "s-2", toSide: "left", text: "" },
    { id: "a-2", from: "s-2", fromSide: "right", to: "s-3", toSide: "left", text: "oui" },
  ],
};

function diagramJson(id: string, data: DiagramData): DocumentJson {
  return { type: "diagram", attrs: { id, shapes: data.shapes, arrows: data.arrows, height: null } };
}

function para(id: string, text: string): DocumentJson {
  return { type: "paragraph", attrs: { id }, content: [{ type: "text", text }] };
}

function block(page: Page) {
  return editor(page).locator(".nano-diagram").first();
}

function bar(page: Page) {
  return page.getByRole("toolbar", { name: "Schéma" });
}

function shapes(page: Page) {
  return block(page).locator(".react-flow__node");
}

/** Données du premier schéma du document affiché. */
async function diagramData(page: Page): Promise<DiagramData> {
  const node = (await topBlocks(page)).find((entry) => entry.type === "diagram");
  return readDiagram(node?.attrs);
}

async function addShape(page: Page, name: string) {
  await bar(page)
    .getByRole("button", { name: `Ajouter : ${name}`, exact: true })
    .click();
}

/** Tire une flèche du point d'accroche `fromSide` d'une forme à `toSide` d'une autre (critère 3). */
async function drawArrow(from: Locator, fromSide: string, to: Locator, toSide: string) {
  const page = from.page();
  await from.hover();
  const start = await from
    .locator(`.react-flow__handle[data-handleid="${fromSide}"]`)
    .boundingBox();
  await to.hover();
  const end = await to.locator(`.react-flow__handle[data-handleid="${toSide}"]`).boundingBox();
  if (!start || !end) throw new Error("point d'accroche introuvable");
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 12 });
  await page.mouse.up();
}

/** Déplace une forme de `dx`, `dy` pixels, en la tenant par son milieu. */
async function dragShape(shape: Locator, dx: number, dy: number) {
  const page = shape.page();
  // Au milieu de la fenêtre : jamais sous la barre figée.
  await shape.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const box = await shape.boundingBox();
  if (!box) throw new Error("forme introuvable");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}

/** Ouvre en modification le premier schéma, par un double clic sur son dessin. */
async function openDiagram(page: Page) {
  await block(page).locator(".nano-diagram-drawing").dblclick();
  await expect(bar(page)).toBeVisible();
  await expect(block(page).locator(".react-flow")).toBeVisible();
  // Le schéma ouvert prend le focus (critère 13).
  await expect(block(page).locator(".nano-diagram-area")).toBeFocused();
}

async function startWithProcess(page: Page) {
  await start(page);
  await openDocument(page, [
    para("p-1", "Le processus :"),
    diagramJson("d-1", PROCESS),
    para("p-2", "Fin."),
  ]);
}

test.describe("T2.20 : schémas", () => {
  test("critère 1 à 3 : insérer un schéma, ajouter trois formes et deux flèches", async ({
    page,
  }) => {
    await start(page);
    await page.keyboard.type("Avant");
    await button(page, "Insérer un schéma").click();
    await expect(bar(page)).toBeVisible();
    expect((await topBlocks(page)).map((entry) => entry.type)).toEqual([
      "paragraph",
      "diagram",
      "paragraph",
    ]);
    await addShape(page, "Rectangle arrondi");
    await addShape(page, "Losange");
    await addShape(page, "Rectangle");
    await expect(shapes(page)).toHaveCount(3);
    await drawArrow(shapes(page).nth(0), "right", shapes(page).nth(1), "left");
    await drawArrow(shapes(page).nth(1), "right", shapes(page).nth(2), "left");
    await expect(block(page).locator(".react-flow__edge")).toHaveCount(2);
    const data = await diagramData(page);
    expect(data.shapes.map((shape) => shape.kind)).toEqual(["rounded", "diamond", "rectangle"]);
    expect(data.arrows.map((arrow) => [arrow.fromSide, arrow.toSide])).toEqual([
      ["right", "left"],
      ["right", "left"],
    ]);
    // Le cercle est aussi proposé (critère 2).
    await expect(bar(page).getByRole("button", { name: "Ajouter : Cercle" })).toBeVisible();
  });

  test("critère 1 : Échap revient au texte, le schéma sélectionné, et Entrée le rouvre (critère 13)", async ({
    page,
  }) => {
    await startWithProcess(page);
    await openDiagram(page);
    await page.keyboard.press("Escape");
    await expect(bar(page)).toHaveCount(0);
    await expect(block(page)).toHaveClass(/ProseMirror-selectednode/);
    await expect(block(page).locator("svg [data-shape-id]")).toHaveCount(3);
    await page.keyboard.press("Enter");
    await expect(bar(page)).toBeVisible();
    // Un clic à côté revient au texte.
    await editor(page).getByText("Fin.").click();
    await expect(bar(page)).toHaveCount(0);
  });

  test("critère 3 : une forme déplacée garde sa flèche reliée, sur la grille magnétique (critère 4)", async ({
    page,
  }) => {
    await startWithProcess(page);
    await openDiagram(page);
    await dragShape(shapes(page).nth(2), 33, 87);
    await expect.poll(async () => (await diagramData(page)).shapes[2]?.y).not.toBe(20);
    const moved = (await diagramData(page)).shapes[2];
    expect(moved?.x).toBeGreaterThan(440);
    expect((moved?.x ?? 1) % 10).toBe(0);
    expect((moved?.y ?? 1) % 10).toBe(0);
    expect((await diagramData(page)).arrows).toHaveLength(2);
    // Le trait de la flèche finit sur le côté gauche de la forme déplacée.
    const path = await block(page)
      .locator(".react-flow__edge")
      .nth(1)
      .locator("path")
      .first()
      .getAttribute("d");
    expect(path).toContain(`L ${moved?.x} ${(moved?.y ?? 0) + 30}`);
  });

  test("critère 2 : un double clic sur une forme permet d'y écrire, sur plusieurs lignes", async ({
    page,
  }) => {
    await startWithProcess(page);
    await openDiagram(page);
    await shapes(page).nth(2).dblclick();
    const field = block(page).getByRole("textbox", { name: "Texte de la forme" });
    await expect(field).toBeFocused();
    await field.fill("");
    await page.keyboard.type("Livraison 🚚");
    await page.keyboard.press("Enter");
    await page.keyboard.type("à domicile");
    await page.keyboard.press("Escape");
    await expect
      .poll(async () => (await diagramData(page)).shapes[2]?.text)
      .toBe("Livraison 🚚\nà domicile");
    // Le texte de la flèche, au double clic (critère 3).
    await block(page)
      .locator(".react-flow__edge")
      .nth(0)
      .locator("path")
      .first()
      .dblclick({ force: true });
    const label = block(page).getByRole("textbox", { name: "Texte de la flèche" });
    await expect(label).toBeFocused();
    await page.keyboard.type("ok");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await diagramData(page)).arrows[0]?.text).toBe("ok");
    await page.keyboard.press("Escape");
    await expect(block(page).locator(".nano-diagram-drawing svg")).toContainText("à domicile");
  });

  test("critère 4 : Ctrl/Cmd+Z annule une action à la fois", async ({ page }) => {
    await startWithProcess(page);
    await openDiagram(page);
    await addShape(page, "Cercle");
    await expect(shapes(page)).toHaveCount(4);
    await waitUndoGroup(page);
    await addShape(page, "Rectangle");
    await expect(shapes(page)).toHaveCount(5);
    await page.keyboard.press("Control+z");
    await expect(shapes(page)).toHaveCount(4);
    await page.keyboard.press("Control+z");
    await expect(shapes(page)).toHaveCount(3);
    await page.keyboard.press("Control+Shift+z");
    await expect(shapes(page)).toHaveCount(4);
    // Le schéma est toujours ouvert, le texte du document intact.
    await expect(bar(page)).toBeVisible();
    await expect(editor(page)).toContainText("Le processus :");
  });

  test("critère 4 : sélection de plusieurs formes, copier, coller, supprimer avec Suppr", async ({
    page,
  }) => {
    await startWithProcess(page);
    await openDiagram(page);
    await shapes(page).nth(0).click();
    await shapes(page)
      .nth(1)
      .click({ modifiers: ["Control"] });
    await expect(block(page).locator(".react-flow__node.selected")).toHaveCount(2);
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await expect(shapes(page)).toHaveCount(5);
    let data = await diagramData(page);
    expect(data.shapes[3]).toMatchObject({ text: "Commande", x: 40, y: 40 });
    expect(data.arrows).toHaveLength(3);
    await page.keyboard.press("Delete");
    await expect(shapes(page)).toHaveCount(3);
    data = await diagramData(page);
    expect(data.arrows).toHaveLength(2);
    // Une flèche choisie se supprime avec Suppr (critère 3).
    await block(page).locator(".react-flow__edge").nth(0).click({ force: true });
    await page.keyboard.press("Delete");
    await expect.poll(async () => (await diagramData(page)).arrows.length).toBe(1);
  });

  test("critère 5 : fond blanc et cadre noir par défaut, fond choisi dans les couleurs de surlignage", async ({
    page,
  }) => {
    await startWithProcess(page);
    await openDiagram(page);
    const swatches = bar(page).getByRole("group", { name: "Fond des formes" });
    await expect(swatches.getByRole("button", { name: "Fond jaune" })).toBeDisabled();
    await shapes(page).nth(1).click();
    await swatches.getByRole("button", { name: "Fond jaune" }).click();
    await expect.poll(async () => (await diagramData(page)).shapes[1]?.fill).toBe("#FFF176");
    expect((await diagramData(page)).shapes[0]?.fill).toBeNull();
    await page.keyboard.press("Escape");
    const drawing = block(page).locator(".nano-diagram-drawing svg");
    await expect(drawing.locator('[data-shape-id="s-2"] polygon')).toHaveAttribute(
      "fill",
      "#FFF176",
    );
    await expect(drawing.locator('[data-shape-id="s-1"] rect')).toHaveAttribute("fill", "#FFFFFF");
    await expect(drawing.locator('[data-shape-id="s-1"] rect')).toHaveAttribute(
      "stroke",
      "#121212",
    );
    await expect(drawing).toHaveAttribute("font-family", /IBM Plex Sans/);
  });

  test("critère 6 : le schéma prend la largeur de la page, et s'agrandit à la poignée du bas", async ({
    page,
  }) => {
    await startWithProcess(page);
    const paragraph = await editor(page).locator("p").first().boundingBox();
    const drawing = await block(page).locator(".nano-diagram-drawing svg").boundingBox();
    expect(Math.abs((drawing?.width ?? 0) - (paragraph?.width ?? 0))).toBeLessThan(2);
    expect(drawing?.height).toBe(160);
    await openDiagram(page);
    const handle = block(page).getByRole("separator", { name: "Hauteur du schéma" });
    const box = await handle.boundingBox();
    if (!box) throw new Error("poignée introuvable");
    await page.mouse.move(box.x + box.width / 2, box.y + 4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 104, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await topBlocks(page))[1]?.attrs?.height).toBe(260);
    await page.keyboard.press("Escape");
    await expect(block(page).locator(".nano-diagram-drawing svg")).toHaveAttribute("height", "260");
  });

  test("critère 7 : le schéma s'enregistre et se rouvre, avec son identifiant", async ({
    page,
  }) => {
    await start(page);
    await page.keyboard.type("Avant");
    await button(page, "Insérer un schéma").click();
    await addShape(page, "Rectangle");
    await addShape(page, "Cercle");
    await drawArrow(shapes(page).nth(0), "right", shapes(page).nth(1), "left");
    await expect(block(page).locator(".react-flow__edge")).toHaveCount(1);
    await page.keyboard.press("Escape");
    const before = await topBlocks(page);
    const reopened = await saveAndReopen(page);
    const node = reopened.content?.find((entry) => entry.type === "diagram");
    expect(node?.attrs?.id).toBe(before[1]?.attrs?.id);
    expect(readDiagram(node?.attrs)).toEqual(readDiagram(before[1]?.attrs));
    expect(readDiagram(node?.attrs).arrows).toHaveLength(1);
    await expect(block(page).locator(".nano-diagram-drawing svg [data-shape-id]")).toHaveCount(2);
  });

  test("critère 8 : à l'impression, le schéma est un dessin SVG, avec ses textes", async ({
    page,
  }) => {
    await startWithProcess(page);
    await openDiagram(page);
    await page.emulateMedia({ media: "print" });
    // Ouvert au moment d'imprimer, il revient d'abord à son dessin.
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    await expect(block(page).locator(".nano-diagram-drawing svg")).toBeVisible();
    await expect(bar(page)).toHaveCount(0);
    const pdf = await printToPdf(page);
    const text = pdfPagesText(pdf).join(" ");
    for (const label of ["Commande", "Payé ?", "Livraison", "oui"]) expect(text).toContain(label);
  });

  test("critère 9 : à l'export Word, le schéma devient une image avec un texte de remplacement", async ({
    page,
  }) => {
    await fakeExportPicker(page);
    await startWithProcess(page);
    const docx = await exportDocx(page);
    expect(docx.document).toContain("<w:drawing>");
    expect(docx.document).toContain('descr="Schéma : Commande, Payé ?, Livraison, oui"');
  });

  test("critère 10 : les textes des formes se cherchent et ne comptent pas dans les mots", async ({
    page,
  }) => {
    await startWithProcess(page);
    const counter = page.locator(".nano-footer").getByRole("button", { name: /mots?( sur|$)/ });
    // « Le processus : » et « Fin. » : 4 mots, sans ceux du schéma.
    await expect(counter).toHaveText(/^4 mots/);
    await page.keyboard.press("Control+f");
    await page.getByRole("textbox", { name: "Rechercher", exact: true }).fill("livraison");
    await expect(page.locator(".nano-search-status")).toHaveText(/1 sur 1/);
    await expect(block(page)).toHaveClass(/nano-search-match-active/);
    await expect(block(page).locator('[data-shape-id="s-3"] rect')).toHaveAttribute(
      "fill",
      "#FFF176",
    );
  });

  test("critère 11 : React Flow n'est pas chargé au démarrage, seulement au premier schéma ouvert", async ({
    page,
  }) => {
    const requested: string[] = [];
    page.on("request", (request) => requested.push(request.url()));
    await startWithProcess(page);
    await settleSelection(page);
    expect(requested.filter((url) => /xyflow|renderDiagramEditor/.test(url))).toEqual([]);
    await openDiagram(page);
    expect(requested.some((url) => /xyflow|renderDiagramEditor/.test(url))).toBe(true);
  });

  test("critère 12 : un document de 10 schémas de 50 formes s'ouvre vite, et un schéma reste fluide", async ({
    page,
  }) => {
    const big: DiagramData = {
      shapes: Array.from({ length: 50 }, (_, index) => ({
        id: `s-${index}`,
        kind: "rectangle" as const,
        x: 20 + (index % 5) * 120,
        y: 20 + Math.floor(index / 5) * 80,
        width: 100,
        height: 50,
        text: `Étape ${index + 1}`,
        fill: null,
      })),
      arrows: Array.from({ length: 49 }, (_, index) => ({
        id: `a-${index}`,
        from: `s-${index}`,
        fromSide: "right" as const,
        to: `s-${index + 1}`,
        toSide: "left" as const,
        text: "",
      })),
    };
    await start(page);
    const begin = Date.now();
    await openDocument(
      page,
      Array.from({ length: 10 }, (_, index) => diagramJson(`d-${index}`, big)),
    );
    await expect(editor(page).locator(".nano-diagram")).toHaveCount(10);
    expect(Date.now() - begin).toBeLessThan(3000);
    await openDiagram(page);
    await expect(shapes(page)).toHaveCount(50);
    const moveStart = Date.now();
    await dragShape(shapes(page).nth(0), 0, 0 + 40);
    await expect.poll(async () => (await diagramData(page)).shapes[0]?.y).toBe(60);
    expect(Date.now() - moveStart).toBeLessThan(3000);
  });

  test("critère 13 : chaque forme a un nom accessible, et le schéma se parcourt au clavier", async ({
    page,
  }) => {
    await startWithProcess(page);
    await openDiagram(page);
    await expect(block(page).getByRole("group", { name: "Commande" })).toHaveCount(1);
    await expect(block(page).locator('[aria-label="Payé ?"]')).toHaveCount(1);
    // Tab parcourt les flèches puis les formes.
    const focusedShape = block(page).locator(".react-flow__node:focus");
    for (let index = 0; index < 4 && (await focusedShape.count()) === 0; index += 1) {
      await page.keyboard.press("Tab");
    }
    await expect(focusedShape).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(block(page).locator(".react-flow__node.selected")).toHaveCount(1);
    // Une forme choisie se déplace aux flèches du clavier.
    const before = (await diagramData(page)).shapes;
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => (await diagramData(page)).shapes.some((s, i) => s.x !== before[i]?.x))
      .toBe(true);
  });
});
