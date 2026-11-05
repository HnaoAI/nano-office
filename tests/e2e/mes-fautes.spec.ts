// Tests d'interface du ticket T2.23 (mes fautes, statistiques et Pareto), dans Chromium, avec le faux
// fournisseur des tests de T3.1 (assistantHelpers.ts), qui annonce le type de chaque correction.
import { expect, test, type Page } from "@playwright/test";
import { enableAssistant, fakeProvider, providerRequests } from "./assistantHelpers";
import { fakeFiles } from "./fakeFileStore";
import { button, editor, start } from "./formatHelpers";

const FAULTY = "Les enfant sont aller a l'école.";
const FIXED = "Les enfants sont allés à l'école.";
const CORRECTIONS = [
  { paragraph: 0, before: "enfant", after: "enfants", type: "agreement" },
  { paragraph: 0, before: "aller", after: "allés", type: "conjugation" },
  { paragraph: 0, before: "a", after: "à", type: "homophone" },
];

async function withTypes(page: Page) {
  await fakeProvider(page, "anthropic", () => ({
    raw: JSON.stringify({ paragraphs: [FIXED], corrections: CORRECTIONS }),
  }));
}

function dialog(page: Page) {
  return page.getByRole("dialog", { name: "Mes fautes" });
}

async function correct(page: Page, text = FAULTY) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Delete");
  await page.keyboard.type(text);
  await page.keyboard.press("ControlOrMeta+A");
  await button(page, "Corriger").click();
  await expect(editor(page).locator(".nano-suggest-inserted").first()).toBeVisible();
}

async function openMistakes(page: Page) {
  await button(page, "Mes fautes").click();
  await expect(dialog(page)).toBeVisible();
}

/** Lignes du tableau équivalent au graphique : type, nombre, pourcentage cumulé. */
async function tableRows(page: Page): Promise<string[][]> {
  return dialog(page)
    .locator("table tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) =>
        // Espace insécable fine de « 33 % » ramenée à une espace simple.
        Array.from(row.children, (cell) => (cell.textContent ?? "").replace(/\s/g, " ").trim()),
      ),
    );
}

function actions(page: Page) {
  return page.getByRole("group", { name: /Modification choisie/ });
}

test.describe("T2.23 : mes fautes", () => {
  test.beforeEach(async ({ page }) => {
    await enableAssistant(page);
  });

  test("critère 13 : sans aucune faute comptée, la fenêtre le dit", async ({ page }) => {
    await withTypes(page);
    await start(page);
    await openMistakes(page);
    await expect(dialog(page)).toContainText(
      "Aucune faute comptée pour l'instant. Utilisez « Corriger », puis acceptez les corrections.",
    );
    await expect(dialog(page).locator("svg.nano-pareto")).toHaveCount(0);
    await expect(dialog(page).getByRole("button", { name: "Remettre à zéro" })).toHaveCount(0);
  });

  test("critère 4 : le type de la faute s'affiche en texte discret près de « Accepter »", async ({
    page,
  }) => {
    await withTypes(page);
    await start(page);
    await correct(page);
    await expect(actions(page).locator(".nano-suggestion-type")).toHaveText("Accord");
  });

  test("critère 5 : une correction acceptée compte, une refusée non", async ({ page }) => {
    await withTypes(page);
    await start(page);
    await correct(page);
    await actions(page).getByRole("button", { name: "Accepter" }).click();
    await expect(actions(page)).toHaveAccessibleName(/« aller » remplacé par « allés »/);
    await actions(page).getByRole("button", { name: "Refuser" }).click();
    await page.getByRole("button", { name: "Fermer les propositions" }).click();
    await openMistakes(page);
    expect(await tableRows(page)).toEqual([["Accord", "1", "100 %"]]);
    await expect(dialog(page)).toContainText("1 faute comptée depuis le");
  });

  test("critère 5 : « Tout accepter » compte chaque correction", async ({ page }) => {
    await withTypes(page);
    await start(page);
    await correct(page);
    await button(page, "Tout accepter").click();
    await openMistakes(page);
    expect(await tableRows(page)).toEqual([
      ["Accord", "1", "33 %"],
      ["Conjugaison", "1", "67 %"],
      ["Homophone", "1", "100 %"],
    ]);
  });

  test("critères 10 à 12 : Pareto trié, cumul, noir jusqu'à 80 %, règles et exemples", async ({
    page,
  }) => {
    await fakeProvider(page, "anthropic", ([text]) =>
      text === "Il a mangé a midi et a dormi a deux heures."
        ? {
            raw: JSON.stringify({
              paragraphs: ["Il a mangé à midi et a dormi à deux heures."],
              corrections: [
                { paragraph: 0, before: "a midi", after: "à midi", type: "homophone" },
                { paragraph: 0, before: "a deux", after: "à deux", type: "homophone" },
              ],
            }),
          }
        : { raw: JSON.stringify({ paragraphs: [FIXED], corrections: CORRECTIONS }) },
    );
    await start(page);
    await correct(page);
    await button(page, "Tout accepter").click();
    await correct(page, "Il a mangé a midi et a dormi a deux heures.");
    await button(page, "Tout accepter").click();
    await openMistakes(page);
    expect(await tableRows(page)).toEqual([
      ["Homophone", "3", "60 %"],
      ["Accord", "1", "80 %"],
      ["Conjugaison", "1", "100 %"],
    ]);
    await expect(dialog(page)).toContainText(
      /5 fautes comptées depuis le \d{1,2}(er)? \S+ \d{4}\./,
    );
    // Noir pour les premiers 80 % (Homophone, Accord), gris pour les autres.
    const fills = await dialog(page)
      .locator("rect.nano-pareto-bar")
      .evaluateAll((bars) => bars.map((bar) => getComputedStyle(bar).fill));
    expect(fills).toEqual(["rgb(18, 18, 18)", "rgb(18, 18, 18)", "rgb(154, 154, 150)"]);
    await expect(dialog(page).locator(".nano-pareto-threshold")).toHaveCount(1);
    await expect(dialog(page).locator(".nano-pareto-point")).toHaveCount(3);
    // Règles et exemples des types en noir seulement, le plus récent en premier.
    const rules = dialog(page).locator(".nano-mistakes-rules section");
    await expect(rules).toHaveCount(2);
    await expect(rules.first()).toContainText("Homophone");
    await expect(rules.first()).toContainText("« avait »");
    await expect(rules.first().getByRole("listitem")).toHaveText([
      "« a » → « à »",
      "« a » → « à »",
      "« a » → « à »",
    ]);
    await expect(rules.nth(1)).toContainText("« enfant » → « enfants »");
    await expect(dialog(page).getByRole("region", { name: "Conjugaison" })).toHaveCount(0);
  });

  test("critère 15 : le graphique a un équivalent en tableau pour les lecteurs d'écran", async ({
    page,
  }) => {
    await withTypes(page);
    await start(page);
    await correct(page);
    await button(page, "Tout accepter").click();
    await openMistakes(page);
    await expect(dialog(page).locator("svg.nano-pareto")).toHaveAttribute("aria-hidden", "true");
    const table = dialog(page).getByRole("table", {
      name: "Fautes par type, de la plus fréquente à la plus rare",
    });
    await expect(table.getByRole("columnheader")).toHaveText([
      "Type",
      "Nombre",
      "Pourcentage cumulé",
    ]);
  });

  test("critère 9 : Échap et « Fermer » ferment la fenêtre", async ({ page }) => {
    await withTypes(page);
    await start(page);
    await openMistakes(page);
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await openMistakes(page);
    await dialog(page).getByRole("button", { name: "Fermer" }).click();
    await expect(dialog(page)).toHaveCount(0);
  });

  test("critère 7 : rien dans le fichier enregistré, et aucune requête en dehors de « Corriger »", async ({
    page,
  }) => {
    const requests = providerRequests(page);
    const outside: string[] = [];
    page.on("request", (request) => {
      if (!request.url().startsWith("http://localhost")) outside.push(request.url());
    });
    await withTypes(page);
    await start(page);
    await correct(page);
    await button(page, "Tout accepter").click();
    await openMistakes(page);
    await page.keyboard.press("Escape");
    await button(page, "Enregistrer").click();
    await expect.poll(async () => (await fakeFiles(page)).files["document.nano"]).toBeTruthy();
    const saved = (await fakeFiles(page)).files["document.nano"] ?? "";
    expect(saved).not.toMatch(/agreement|homophone|mistake|Accord|Homophone/);
    expect(requests.filter((request) => request.startsWith("POST"))).toHaveLength(1);
    expect(outside.every((url) => url.startsWith("https://api.anthropic.com/"))).toBe(true);
    const stored = await page.evaluate(() => localStorage.getItem("nano-office:mistake-stats"));
    expect(stored).toContain("homophone");
  });

  test("critère 8 : assistant éteint, le bouton disparaît, et les statistiques reviennent avec lui", async ({
    page,
  }) => {
    await withTypes(page);
    await start(page);
    await correct(page);
    await button(page, "Tout accepter").click();
    const settings = page.getByRole("dialog", { name: "Réglages" });
    await button(page, "Réglages").click();
    await settings.getByRole("switch").setChecked(false);
    await settings.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("button", { name: "Mes fautes" })).toHaveCount(0);
    await button(page, "Réglages").click();
    await settings.getByRole("switch").setChecked(true);
    await settings.getByRole("button", { name: "Enregistrer" }).click();
    await openMistakes(page);
    expect(await tableRows(page)).toHaveLength(3);
  });

  test("critère 7 : les statistiques survivent au rechargement", async ({ page }) => {
    await withTypes(page);
    await start(page);
    await correct(page);
    await button(page, "Tout accepter").click();
    await page.reload();
    await editor(page).click();
    await openMistakes(page);
    expect(await tableRows(page)).toHaveLength(3);
  });

  test("critère 14 : « Remettre à zéro » demande une confirmation, puis efface tout", async ({
    page,
  }) => {
    await withTypes(page);
    await start(page);
    await correct(page);
    await button(page, "Tout accepter").click();
    await openMistakes(page);
    await dialog(page).getByRole("button", { name: "Remettre à zéro" }).click();
    await expect(dialog(page)).toContainText("Effacer toutes les fautes comptées ?");
    await dialog(page).getByRole("button", { name: "Garder" }).click();
    expect(await tableRows(page)).toHaveLength(3);
    await dialog(page).getByRole("button", { name: "Remettre à zéro" }).click();
    await dialog(page).getByRole("button", { name: "Effacer" }).click();
    await expect(dialog(page)).toContainText("Aucune faute comptée pour l'instant.");
    await page.keyboard.press("Escape");
    await page.reload();
    await editor(page).click();
    await openMistakes(page);
    await expect(dialog(page)).toContainText("Aucune faute comptée pour l'instant.");
  });

  test("critère 5 : une correction annulée par une autre modification du texte ne compte pas", async ({
    page,
  }) => {
    await withTypes(page);
    await start(page);
    await correct(page);
    await editor(page).press("End");
    await page.keyboard.type(" Fin.");
    await expect(editor(page).locator(".nano-suggest-inserted")).toHaveCount(0);
    await openMistakes(page);
    await expect(dialog(page)).toContainText("Aucune faute comptée pour l'instant.");
  });

  test("critère 5 : Ctrl/Cmd+Z après une acceptation ne retire pas le compte", async ({ page }) => {
    await withTypes(page);
    await start(page);
    await correct(page);
    await button(page, "Tout accepter").click();
    await editor(page).focus();
    await page.keyboard.press("ControlOrMeta+Z");
    await expect(editor(page)).toHaveText(FAULTY);
    await openMistakes(page);
    expect(await tableRows(page)).toHaveLength(3);
  });

  test("critère 14 : Échap pendant la confirmation revient en arrière sans rien effacer", async ({
    page,
  }) => {
    await withTypes(page);
    await start(page);
    await correct(page);
    await button(page, "Tout accepter").click();
    await openMistakes(page);
    await dialog(page).getByRole("button", { name: "Remettre à zéro" }).click();
    await page.keyboard.press("Escape");
    await expect(dialog(page).getByRole("button", { name: "Remettre à zéro" })).toBeVisible();
    expect(await tableRows(page)).toHaveLength(3);
  });
});
