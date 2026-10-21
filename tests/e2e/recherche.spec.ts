// Tests d'interface du ticket T2.1 (rechercher et remplacer), dans Chromium.
import { expect, test, type Page } from "@playwright/test";
import { fakeFiles } from "./fakeFileStore";
import {
  button,
  editor,
  MAC_USER_AGENT,
  pasteFromOtherApp,
  selectText,
  start,
  waitUndoGroup,
  WINDOWS_USER_AGENT,
  ydocJson,
} from "./formatHelpers";

function bar(page: Page) {
  return page.getByRole("search", { name: "Rechercher dans le document" });
}

function field(page: Page) {
  return bar(page).getByRole("textbox", { name: "Rechercher", exact: true });
}

function status(page: Page) {
  return bar(page).getByRole("status");
}

function matches(page: Page) {
  return editor(page).locator(".nano-search-match");
}

function active(page: Page) {
  return editor(page).locator(".nano-search-match-active");
}

/** Texte sélectionné dans la page. */
function selectedText(page: Page) {
  return page.evaluate(() => window.getSelection()?.toString() ?? "");
}

/** Écrit des paragraphes en collant du HTML, plus vite qu'au clavier. */
async function writeParagraphs(page: Page, paragraphs: string[]) {
  await pasteFromOtherApp(
    page,
    paragraphs.map((text) => `<p>${text}</p>`).join(""),
    paragraphs.join("\n"),
  );
  await expect(editor(page).locator("p").first()).not.toHaveText("");
}

test("critère 1 : Ctrl/Cmd+F ouvre la barre, le champ prend le focus et reprend la sélection", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Le chat dort. Le chat mange.");
  await selectText(page, "chat");
  const prevented = await page.evaluate(() => {
    const event = new KeyboardEvent("keydown", {
      key: "f",
      code: "KeyF",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.querySelector(".nano-editor")?.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(bar(page)).toBeVisible();
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveValue("chat");
  await expect(status(page)).toHaveText("1 sur 2");
});

test("critère 1 : Échap ferme la barre et rend le focus au document, à l'endroit trouvé", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("un mot, puis un autre mot");
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("ControlOrMeta+f");
  await page.keyboard.type("mot");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("2 sur 2");
  await page.keyboard.press("Escape");
  await expect(bar(page)).toHaveCount(0);
  await expect(matches(page)).toHaveCount(0);
  await expect(editor(page)).toBeFocused();
  expect(await selectedText(page)).toBe("mot");
  await page.keyboard.type("MOT");
  await expect(editor(page)).toHaveText("un mot, puis un autre MOT");
});

test("critère 2 : surligne pendant la frappe, « 3 sur 12 », Entrée, Shift+Entrée et les boutons", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("pomme ".repeat(12) + "poire");
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("ControlOrMeta+f");
  await page.keyboard.type("pom");
  await expect(matches(page)).toHaveCount(12);
  await expect(active(page)).toHaveCount(1);
  await expect(status(page)).toHaveText("1 sur 12");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("3 sur 12");
  await page.keyboard.press("Shift+Enter");
  await expect(status(page)).toHaveText("2 sur 12");
  await bar(page).getByRole("button", { name: "Occurrence suivante" }).click();
  await expect(status(page)).toHaveText("3 sur 12");
  await bar(page).getByRole("button", { name: "Occurrence précédente" }).click();
  await bar(page).getByRole("button", { name: "Occurrence précédente" }).click();
  await bar(page).getByRole("button", { name: "Occurrence précédente" }).click();
  await expect(status(page)).toHaveText("12 sur 12");
  await expect(field(page)).toBeFocused();
  await page.keyboard.type("xyz");
  await expect(status(page)).toHaveText("Aucun résultat");
  await expect(matches(page)).toHaveCount(0);
});

test("critère 2 : la page défile jusqu'à l'occurrence active", async ({ page }) => {
  await start(page);
  await writeParagraphs(page, [
    ...Array.from({ length: 80 }, (_, index) => `Paragraphe ${String(index)}`),
    "Le trésor est ici.",
  ]);
  await page.keyboard.press("ControlOrMeta+Home");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.keyboard.press("ControlOrMeta+f");
  await page.keyboard.type("trésor");
  await expect(active(page)).toBeInViewport();
  const box = await active(page).boundingBox();
  const barBox = await bar(page).boundingBox();
  if (!box || !barBox) throw new Error("occurrence ou barre invisible");
  expect(box.y).toBeGreaterThan(barBox.y + barBox.height);
  await expect(bar(page)).toBeInViewport();
});

test("critère 3 : ignore les majuscules, sauf avec « Respecter les majuscules »", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Paris, PARIS et paris");
  await page.keyboard.press("ControlOrMeta+f");
  await page.keyboard.type("paris");
  await expect(matches(page)).toHaveCount(3);
  await bar(page).getByRole("checkbox", { name: "Respecter les majuscules" }).check();
  await expect(matches(page)).toHaveCount(1);
  await expect(status(page)).toHaveText("1 sur 1");
});

test("critère 3 : trouve un texte coupé par une mise en forme (bon**jour**)", async ({ page }) => {
  await start(page);
  await page.keyboard.type("bonjour à tous");
  await selectText(page, "jour");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.press("ControlOrMeta+f");
  await field(page).fill("bonjour");
  await expect(status(page)).toHaveText("1 sur 1");
  await expect(active(page)).toHaveText(["bon", "jour"]);
});

test("critère 4 : « Remplacer… » déplie un second champ ; Remplacer change l'occurrence active puis la suivante", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("chat, chat et chat");
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("ControlOrMeta+f");
  await page.keyboard.type("chat");
  const toggle = bar(page).getByRole("button", { name: "Remplacer…" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(bar(page).getByRole("textbox", { name: "Remplacer par" })).toHaveCount(0);
  await toggle.click();
  const replaceField = bar(page).getByRole("textbox", { name: "Remplacer par" });
  await expect(replaceField).toBeFocused();
  await replaceField.fill("chien");
  await bar(page).getByRole("button", { name: "Remplacer", exact: true }).click();
  await expect(editor(page)).toHaveText("chien, chat et chat");
  await expect(status(page)).toHaveText("1 sur 2");
  await page.keyboard.press("Enter");
  await expect(editor(page)).toHaveText("chien, chien et chat");
});

for (const [platform, userAgent, keys] of [
  ["Windows", WINDOWS_USER_AGENT, "Control+KeyH"],
  ["Mac", MAC_USER_AGENT, "Meta+Alt+KeyF"],
] as const) {
  test.describe(platform, () => {
    test.use({ userAgent });
    test(`critère 4 : ${keys} ouvre directement le remplacement`, async ({ page }) => {
      await start(page);
      await page.keyboard.type("texte");
      await page.keyboard.press(keys);
      await expect(bar(page).getByRole("textbox", { name: "Remplacer par" })).toBeVisible();
      await expect(field(page)).toBeFocused();
    });
  });
}

test.describe("Mac", () => {
  test.use({ userAgent: MAC_USER_AGENT });
  test("critère 4 : Cmd+H n'ouvre pas la barre (il masque l'application sur Mac)", async ({
    page,
  }) => {
    await start(page);
    await page.keyboard.type("texte");
    await page.keyboard.press("Meta+KeyH");
    await page.keyboard.press("Meta+KeyF");
    await expect(bar(page)).toBeVisible();
    await expect(bar(page).getByRole("textbox", { name: "Remplacer par" })).toHaveCount(0);
  });
});

test("critère 5 : le remplacement prend la mise en forme du début de l'occurrence", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Cher Paul, merci.");
  await selectText(page, "Pa");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.press("ControlOrMeta+f");
  await field(page).fill("paul");
  await bar(page).getByRole("button", { name: "Remplacer…" }).click();
  await bar(page).getByRole("textbox", { name: "Remplacer par" }).fill("Jeanne");
  await bar(page).getByRole("button", { name: "Remplacer", exact: true }).click();
  await expect(editor(page).locator("strong")).toHaveText("Jeanne");
  await expect(editor(page)).toHaveText("Cher Jeanne, merci.");
});

test("critère 6 : Tout remplacer est une seule étape d'annulation, et affiche « 12 remplacements »", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Dupond ".repeat(12).trim());
  await waitUndoGroup(page);
  await page.keyboard.press("ControlOrMeta+f");
  await page.keyboard.type("dupond");
  await bar(page).getByRole("button", { name: "Remplacer…" }).click();
  await bar(page).getByRole("textbox", { name: "Remplacer par" }).fill("Dupont");
  await bar(page).getByRole("button", { name: "Tout remplacer" }).click();
  await expect(status(page)).toHaveText("12 remplacements");
  await expect(editor(page)).toHaveText("Dupont ".repeat(12).trim());
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor(page)).toHaveText("Dupond ".repeat(12).trim());
});

test("critère 7 : la recherche couvre les titres, les listes et les cellules de tableau", async ({
  page,
}) => {
  await start(page);
  await pasteFromOtherApp(
    page,
    "<h1>Les vacances</h1><ul><li>vacances</li></ul><table><tr><td>Vacances</td></tr></table><p>fin</p>",
    "",
  );
  await page.keyboard.press("ControlOrMeta+f");
  await page.keyboard.type("vacances");
  await expect(status(page)).toHaveText(/sur 3$/);
  await expect(editor(page).locator("h1 .nano-search-match")).toHaveCount(1);
  await expect(editor(page).locator("li .nano-search-match")).toHaveCount(1);
  await expect(editor(page).locator("td .nano-search-match")).toHaveCount(1);
});

test("critère 7 : le surlignage n'est jamais enregistré et ne change pas l'état « Enregistré »", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Le chat et le chat");
  await button(page, "Enregistrer").click();
  const indicator = page.getByRole("banner").locator(".nano-save-state");
  await expect(indicator).toHaveText("Enregistré");
  const saved = (await fakeFiles(page)).files["document.nano"];
  const before = await ydocJson(page);
  await page.keyboard.press("ControlOrMeta+f");
  await page.keyboard.type("chat");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(4_000);
  await expect(indicator).toHaveText("Enregistré");
  expect(await ydocJson(page)).toEqual(before);
  expect((await fakeFiles(page)).files["document.nano"]).toBe(saved);
  expect(saved).not.toContain("nano-search");
});

test("critère 8 : texte vide, accents et emojis, remplacement vide, remplacement qui contient le texte cherché", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Café 😀 et café 😀, très très bien");
  await page.keyboard.press("ControlOrMeta+f");
  await expect(matches(page)).toHaveCount(0);
  await expect(status(page)).toHaveText("");
  await page.keyboard.type("😀");
  await expect(matches(page)).toHaveCount(2);
  await field(page).fill("CAFÉ");
  await expect(matches(page)).toHaveCount(2);

  await bar(page).getByRole("button", { name: "Remplacer…" }).click();
  await bar(page).getByRole("textbox", { name: "Remplacer par" }).fill("café crème");
  await bar(page).getByRole("button", { name: "Tout remplacer" }).click();
  await expect(status(page)).toHaveText("2 remplacements");
  await expect(editor(page)).toHaveText("café crème 😀 et café crème 😀, très très bien");

  await field(page).fill("très ");
  await bar(page).getByRole("textbox", { name: "Remplacer par" }).fill("");
  await bar(page).getByRole("button", { name: "Tout remplacer" }).click();
  await expect(editor(page)).toHaveText("café crème 😀 et café crème 😀, bien");
});

test("critère 8 : 1 000 occurrences dans un long document, sans blocage", async ({ page }) => {
  await start(page);
  await writeParagraphs(
    page,
    Array.from({ length: 100 }, () => "mot ".repeat(10) + "texte de remplissage ".repeat(10)),
  );
  await page.keyboard.press("ControlOrMeta+f");
  const started = Date.now();
  await page.keyboard.type("mot");
  await expect(status(page)).toHaveText(/ sur 1000$/);
  await page.keyboard.press("Enter");
  expect(Date.now() - started).toBeLessThan(5_000);
  await bar(page).getByRole("button", { name: "Remplacer…" }).click();
  await bar(page).getByRole("textbox", { name: "Remplacer par" }).fill("mot mot");
  await bar(page).getByRole("button", { name: "Tout remplacer" }).click();
  await expect(status(page)).toHaveText("1000 remplacements");
});
