// Tests d'interface du ticket T2.5 (page A4 et marges réglables), dans Chromium.
import { expect, test, type Page } from "@playwright/test";
import { flushBackups } from "./backupHelpers";
import { fakeFiles, setFakeFiles } from "./fakeFileStore";
import { button, editor, saveAndReopen, start, waitUndoGroup, ydocJson } from "./formatHelpers";

/** Un centimètre du CSS, en pixels. */
const CM = 96 / 2.54;

function dialog(page: Page) {
  return page.getByRole("dialog", { name: "Mise en page" });
}

/** Ouvre la boîte « Mise en page ». */
async function openDialog(page: Page) {
  await button(page, "Mise en page…").click();
  await expect(dialog(page)).toBeVisible();
}

/** Choisit une orientation et des marges, puis « Appliquer ». */
async function applySetup(
  page: Page,
  orientation: "Portrait" | "Paysage",
  margins:
    "Normales" | "Étroites" | "Larges" | Record<"Haut" | "Bas" | "Gauche" | "Droite", string>,
) {
  await openDialog(page);
  await dialog(page).getByRole("radio", { name: orientation }).check();
  if (typeof margins === "string") {
    await dialog(page)
      .getByRole("radio", { name: new RegExp(`^${margins}`) })
      .check();
  } else {
    await dialog(page).getByRole("radio", { name: "Personnalisées" }).check();
    for (const [side, value] of Object.entries(margins)) {
      await dialog(page).getByRole("textbox", { name: side }).fill(value);
    }
  }
  await dialog(page).getByRole("button", { name: "Appliquer" }).click();
  await expect(dialog(page)).toBeHidden();
}

/** Largeur de la page et ses marges, en centimètres arrondis au centième. */
async function pageGeometry(page: Page) {
  return page.locator(".nano-page").evaluate((element, cm) => {
    const style = getComputedStyle(element);
    const round = (px: string | number) =>
      Math.round((Number.parseFloat(String(px)) / cm) * 100) / 100;
    return {
      width: round(element.getBoundingClientRect().width),
      top: round(style.paddingTop),
      bottom: round(style.paddingBottom),
      left: round(style.paddingLeft),
      right: round(style.paddingRight),
    };
  }, CM);
}

test("critère 1 : le bouton « Mise en page » ouvre une boîte avec l'orientation et les marges", async ({
  page,
}) => {
  await start(page);
  await openDialog(page);
  const box = dialog(page);
  await expect(box.getByRole("radio", { name: "Portrait" })).toBeChecked();
  await expect(box.getByRole("radio", { name: "Paysage" })).not.toBeChecked();
  await expect(box.getByRole("radio")).toHaveCount(6);
  await expect(box.getByRole("radio", { name: "Normales 2,5 cm" })).toBeChecked();
  await expect(box.getByRole("radio", { name: "Étroites 1,27 cm" })).toBeVisible();
  await expect(box.getByRole("radio", { name: "Larges 3,5 cm" })).toBeVisible();
  await expect(box.getByText("Page A4", { exact: false })).toBeVisible();
  // Au style de la boîte de la copie de secours.
  await expect(box).toHaveClass(/nano-dialog/);
  // Personnalisées : haut, bas, gauche et droite en centimètres.
  await box.getByRole("radio", { name: "Personnalisées" }).check();
  for (const side of ["Haut", "Bas", "Gauche", "Droite"]) {
    await expect(box.getByRole("textbox", { name: side })).toHaveValue("2,5");
  }
  await expect(box.getByText("De 0,5 à 5 cm.")).toBeVisible();
});

test("critère 1 : le bouton « Mise en page… » est dans la barre de mise en forme, et l'en-tête tient sur une ligne à 1 280 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page);
  await page.keyboard.type("A");
  const bar = page.getByRole("toolbar", { name: "Mise en forme" });
  await expect(bar.getByRole("button", { name: "Mise en page…", exact: true })).toBeVisible();
  const header = page.getByRole("banner");
  const files = header.getByRole("toolbar", { name: "Fichier" });
  await expect(files.getByRole("button")).toHaveText([
    "Nouveau",
    "Ouvrir…",
    "Enregistrer sous…",
    "Imprimer",
    "Exporter en Word…",
    /^Enregistrer/,
  ]);
  const brand = await header.locator(".nano-brand").boundingBox();
  const menu = await files.boundingBox();
  // Même ligne : le groupe Fichier commence à la hauteur du logo, pas en dessous.
  expect(
    Math.abs(
      (menu?.y ?? 0) + (menu?.height ?? 0) / 2 - ((brand?.y ?? 0) + (brand?.height ?? 0) / 2),
    ),
  ).toBeLessThan(20);
});

test("critère 1 : une marge personnalisée hors de 0,5 à 5 cm ne peut pas être appliquée", async ({
  page,
}) => {
  await start(page);
  await openDialog(page);
  const box = dialog(page);
  await box.getByRole("radio", { name: "Personnalisées" }).check();
  const apply = box.getByRole("button", { name: "Appliquer" });
  for (const value of ["0,4", "5,1", "", "abc", "-1"]) {
    await box.getByRole("textbox", { name: "Haut" }).fill(value);
    await expect(apply).toBeDisabled();
    await expect(box.getByRole("textbox", { name: "Haut" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  }
  for (const value of ["0,5", "5", "1.8", "3,7"]) {
    await box.getByRole("textbox", { name: "Haut" }).fill(value);
    await expect(apply).toBeEnabled();
  }
});

test("critère 1 : Annuler et Échap ferment la boîte sans rien changer", async ({ page }) => {
  await start(page);
  await page.keyboard.type("Lettre");
  const before = await ydocJson(page);
  await openDialog(page);
  await dialog(page).getByRole("radio", { name: "Paysage" }).check();
  await dialog(page).getByRole("button", { name: "Annuler" }).click();
  await expect(dialog(page)).toBeHidden();
  await openDialog(page);
  await expect(dialog(page).getByRole("radio", { name: "Portrait" })).toBeChecked();
  await dialog(page).getByRole("radio", { name: "Paysage" }).check();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  expect(await ydocJson(page)).toEqual(before);
  expect((await pageGeometry(page)).width).toBe(21);
  // Le curseur revient dans l'éditeur.
  await expect(editor(page)).toBeFocused();
});

test("critère 2 et 4 : sans réglage, la page a la largeur d'une feuille A4 en portrait et les marges Normales", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await start(page);
  expect(await pageGeometry(page)).toEqual({
    width: 21,
    top: 2.5,
    bottom: 2.5,
    left: 2.5,
    right: 2.5,
  });
  await expect(page.locator(".nano-page")).toHaveAttribute("data-orientation", "portrait");
});

test("critère 2 : la page suit l'orientation et les marges choisies, à l'échelle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await start(page);
  await applySetup(page, "Paysage", "Étroites");
  expect(await pageGeometry(page)).toEqual({
    width: 29.7,
    top: 1.27,
    bottom: 1.27,
    left: 1.27,
    right: 1.27,
  });
  await applySetup(page, "Portrait", { Haut: "1", Bas: "4,9", Gauche: "0,5", Droite: "5" });
  expect(await pageGeometry(page)).toEqual({ width: 21, top: 1, bottom: 4.9, left: 0.5, right: 5 });
  await applySetup(page, "Portrait", "Larges");
  expect(await pageGeometry(page)).toEqual({
    width: 21,
    top: 3.5,
    bottom: 3.5,
    left: 3.5,
    right: 3.5,
  });
});

test("critère 2 : à petite largeur de fenêtre, les marges réduites restent et l'écran ne déborde jamais", async ({
  page,
}) => {
  await start(page);
  await applySetup(page, "Paysage", "Larges");
  for (const width of [480, 800, 1100]) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 480, height: 800 });
  const padding = await page
    .locator(".nano-page")
    .evaluate((element) => getComputedStyle(element).paddingLeft);
  expect(padding).toBe("20px");
});

test("critère 3 : les réglages sont enregistrés dans le fichier et retrouvés à la réouverture", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await start(page);
  await page.keyboard.type("Lettre à Zoé 😀");
  await applySetup(page, "Paysage", { Haut: "1,5", Bas: "2", Gauche: "3", Droite: "1,27" });
  const reopened = await saveAndReopen(page);
  expect(reopened.content?.[0]?.content?.[0]?.text).toBe("Lettre à Zoé 😀");
  const file = JSON.parse((await fakeFiles(page)).files["document.nano"] ?? "{}") as {
    content: { attrs?: unknown };
  };
  expect(file.content.attrs).toEqual({
    pageOrientation: "landscape",
    pageMargins: { top: 1.5, bottom: 2, left: 3, right: 1.27 },
  });
  expect(await pageGeometry(page)).toEqual({
    width: 29.7,
    top: 1.5,
    bottom: 2,
    left: 3,
    right: 1.27,
  });
  await openDialog(page);
  await expect(dialog(page).getByRole("radio", { name: "Paysage" })).toBeChecked();
  await expect(dialog(page).getByRole("radio", { name: "Personnalisées" })).toBeChecked();
  await expect(dialog(page).getByRole("textbox", { name: "Droite" })).toHaveValue("1,27");
});

test("critère 3 : les réglages sont gardés dans la copie de secours", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await start(page);
  await page.keyboard.type("Brouillon");
  await applySetup(page, "Paysage", "Larges");
  await flushBackups(page);
  await page.reload();
  await expect(editor(page)).toHaveText("Brouillon");
  expect(await pageGeometry(page)).toEqual({
    width: 29.7,
    top: 3.5,
    bottom: 3.5,
    left: 3.5,
    right: 3.5,
  });
});

test("critère 5 : Ctrl/Cmd+Z annule un changement de mise en page en une fois, et Rétablir le refait", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await start(page);
  await page.keyboard.type("Texte");
  await waitUndoGroup(page);
  await applySetup(page, "Paysage", "Étroites");
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() => pageGeometry(page))
    .toEqual({
      width: 21,
      top: 2.5,
      bottom: 2.5,
      left: 2.5,
      right: 2.5,
    });
  // Le texte tapé avant n'est pas annulé avec la mise en page.
  await expect(editor(page)).toHaveText("Texte");
  await page.getByRole("button", { name: "Rétablir" }).click();
  await expect.poll(async () => (await pageGeometry(page)).width).toBe(29.7);
});

test("critère 5 : changer la mise en page compte comme une modification, enregistrée automatiquement", async ({
  page,
}) => {
  await start(page);
  await setFakeFiles(page, { nextSaveName: "lettre.nano" });
  await page.keyboard.type("Début");
  await button(page, "Enregistrer").click();
  const indicator = page.getByRole("banner").locator(".nano-save-state");
  await expect(indicator).toHaveText("Enregistré");
  await applySetup(page, "Paysage", "Normales");
  await expect(page).toHaveTitle("• lettre.nano - Nano Buro");
  await expect
    .poll(async () => (await fakeFiles(page)).files["lettre.nano"], { timeout: 6_000 })
    .toContain('"pageOrientation":"landscape"');
  await expect(indicator).toHaveText("Enregistré");
});
