// Tests d'interface du ticket T2.19 (encadré), dans Chromium.
import { expect, test, type Page } from "@playwright/test";
import {
  button,
  editor,
  pasteFromOtherApp,
  saveAndReopen,
  settleSelection,
  start,
  topBlocks,
  waitUndoGroup,
} from "./formatHelpers";
import { insertTable } from "./tableHelpers";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

function callouts(page: Page) {
  return editor(page).locator(".nano-callout");
}

/** Ouvre le menu de l'encadré et choisit `label`. */
async function chooseCallout(page: Page, label: string) {
  await button(page, "Encadré").click();
  await page
    .getByRole("group", { name: "Style de l'encadré" })
    .getByRole("menuitemradio", { name: label, exact: true })
    .click();
}

/** Tape deux paragraphes et les sélectionne tous les deux. */
async function twoParagraphs(page: Page) {
  await start(page);
  await page.keyboard.type("Consigne");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Deuxième ligne");
  await page.keyboard.press("ControlOrMeta+a");
  await settleSelection(page);
}

test("critère 1 : « Encadré » encadre les paragraphes sélectionnés, et le même bouton le retire", async ({
  page,
}) => {
  await twoParagraphs(page);
  await expect(button(page, "Encadré").locator("svg")).toBeVisible();
  await chooseCallout(page, "Cadre fin");
  await expect(callouts(page)).toHaveCount(1);
  await expect(callouts(page).locator("p")).toHaveText(["Consigne", "Deuxième ligne"]);
  await expect(button(page, "Encadré")).toHaveAttribute("aria-pressed", "true");

  await button(page, "Encadré").click();
  await page.getByText("Retirer l'encadré").click();
  await expect(callouts(page)).toHaveCount(0);
  const blocks = await topBlocks(page);
  expect(blocks.map((block) => block.type)).toEqual(["paragraph", "paragraph"]);
  await expect(button(page, "Encadré")).toHaveAttribute("aria-pressed", "false");
});

test("critère 2 : trois styles, bords arrondis à 6 px et marge intérieure de 12 px", async ({
  page,
}) => {
  await twoParagraphs(page);
  const expected: [string, string, string, string][] = [
    ["Cadre fin", "rgb(58, 58, 56)", "1px", "rgba(0, 0, 0, 0)"],
    ["Cadre et fond gris", "rgb(58, 58, 56)", "1px", "rgb(243, 243, 241)"],
    ["Fond gris", "rgba(0, 0, 0, 0)", "1px", "rgb(243, 243, 241)"],
  ];
  for (const [label, borderColor, borderWidth, background] of expected) {
    await chooseCallout(page, label);
    await expect(callouts(page)).toHaveCount(1);
    const style = await callouts(page).evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        borderColor: computed.borderTopColor,
        borderWidth: computed.borderTopWidth,
        background: computed.backgroundColor,
        radius: computed.borderTopLeftRadius,
        padding: computed.paddingTop,
      };
    });
    expect(style).toEqual({ borderColor, borderWidth, background, radius: "6px", padding: "12px" });
    await button(page, "Encadré").click();
    await expect(page.getByRole("menuitemradio", { name: label, exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.keyboard.press("Escape");
  }
  // Changer de style ne crée jamais un encadré dans l'encadré.
  await expect(editor(page).locator(".nano-callout .nano-callout")).toHaveCount(0);
});

test("critère 3 : Entrée deux fois sur une ligne vide en fin d'encadré en sort", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Définition");
  await chooseCallout(page, "Cadre fin");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Suite");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Après");
  await expect(callouts(page).locator("p")).toHaveText(["Définition", "Suite"]);
  const blocks = await topBlocks(page);
  expect(blocks.map((block) => block.type)).toEqual(["callout", "paragraph"]);
  expect(blocks[1]?.content?.[0]?.text).toBe("Après");
});

test("critère 3 : une liste et un titre vont dans un encadré, un tableau ne peut pas être encadré", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.press("ControlOrMeta+Shift+Digit2");
  await page.keyboard.type("Résumé");
  await page.keyboard.press("Enter");
  await button(page, "Liste à puces").click();
  await page.keyboard.type("Point");
  await page.keyboard.press("ControlOrMeta+a");
  await settleSelection(page);
  await chooseCallout(page, "Fond gris");
  await expect(callouts(page).locator("h2")).toHaveText("Résumé");
  await expect(callouts(page).locator("li")).toHaveText("Point");

  await page.keyboard.press("ControlOrMeta+End");
  await insertTable(page, 2, 2);
  await expect(editor(page).locator("table")).toHaveCount(1);
  await expect(editor(page).locator(".nano-callout table")).toHaveCount(0);
  // Le curseur dans une cellule : rien ne peut être encadré.
  await expect(button(page, "Encadré")).toBeDisabled();
});

test("critère 4 : un bloc avec son identifiant, gardé à l'enregistrement et à la réouverture", async ({
  page,
}) => {
  await twoParagraphs(page);
  await chooseCallout(page, "Cadre et fond gris");
  const before = (await topBlocks(page))[0];
  expect(before?.type).toBe("callout");
  expect(before?.attrs?.id).toEqual(expect.any(String));
  const json = await saveAndReopen(page);
  const after = json.content?.[0];
  expect(after?.type).toBe("callout");
  expect(after?.attrs?.id).toBe(before?.attrs?.id);
  expect(after?.attrs?.calloutStyle).toBe("border-shaded");
  await expect(callouts(page)).toHaveAttribute("data-callout", "border-shaded");
});

test("critère 4 : le texte de l'encadré se cherche et se compte", async ({ page }) => {
  await twoParagraphs(page);
  await chooseCallout(page, "Cadre fin");
  await page.keyboard.press("ControlOrMeta+End");
  await settleSelection(page);
  await expect(
    page.locator(".nano-footer").getByRole("button", { name: /mots?( sur|$)/ }),
  ).toHaveText("3 mots");
  await page.keyboard.press("ControlOrMeta+f");
  await page
    .getByRole("search", { name: "Rechercher dans le document" })
    .getByRole("textbox", { name: "Rechercher", exact: true })
    .fill("ligne");
  await expect(editor(page).locator(".nano-callout .nano-search-match")).toHaveCount(1);
});

test("critère 5 : gardé dans un collage interne, retiré d'un collage extérieur", async ({
  page,
}) => {
  await twoParagraphs(page);
  await chooseCallout(page, "Cadre fin");
  await page.keyboard.press("ControlOrMeta+a");
  await settleSelection(page);
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+End");
  await settleSelection(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(callouts(page)).toHaveCount(2);

  // Collage extérieur sur une ligne vide après les encadrés : le texte arrive, sans le cadre.
  await page.keyboard.press("ControlOrMeta+End");
  await settleSelection(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await pasteFromOtherApp(
    page,
    '<div class="nano-callout" data-callout="shaded"><p>Collé ailleurs</p></div>',
    "Collé ailleurs",
  );
  await expect(editor(page).getByText("Collé ailleurs")).toBeVisible();
  await expect(callouts(page)).toHaveCount(2);
  await expect(callouts(page).getByText("Collé ailleurs")).toHaveCount(0);
});

test("critère 5 : à l'impression, le cadre est gardé et ne se coupe pas sur deux pages", async ({
  page,
}) => {
  await twoParagraphs(page);
  await chooseCallout(page, "Cadre fin");
  await page.emulateMedia({ media: "print" });
  const style = await callouts(page).evaluate((node) => {
    const computed = getComputedStyle(node);
    return { border: computed.borderTopWidth, breakInside: computed.breakInside };
  });
  await page.emulateMedia({ media: "screen" });
  expect(style).toEqual({ border: "1px", breakInside: "avoid" });
});

test("critère 6 : Ctrl/Cmd+Z retire l'encadré en une fois", async ({ page }) => {
  await twoParagraphs(page);
  await waitUndoGroup(page);
  await chooseCallout(page, "Cadre fin");
  await expect(callouts(page)).toHaveCount(1);
  await waitUndoGroup(page);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(callouts(page)).toHaveCount(0);
  await expect(editor(page).locator("p")).toHaveText(["Consigne", "Deuxième ligne"]);
});
