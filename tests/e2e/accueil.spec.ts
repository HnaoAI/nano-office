// Tests d'interface du ticket H4 : écran d'accueil au N, écrit dans index.html, affiché à chaque ouverture
// pendant 1,5 s, qui devient « Nano Buro se met à jour » sans disparaître quand une mise à jour est trouvée
// pendant lui (H3). Serveur de développement : l'accueil y est raccourci (critère 9), sauf avec `realWelcome`
// ou `holdWelcome(page, true)` ; la mise à jour est simulée par `window.__nanoLaunch` (H2).
// L'accueil hors ligne, sur la version construite, est dans accueil-version-construite.spec.ts.
import { expect, test, type Page } from "@playwright/test";
import { serializeDocument } from "../../src/core/fileFormat";
import type { DocumentJson } from "../../src/core/types";
import { paragraph, ydocFromJson } from "../core/helpers";
import { flushBackups } from "./backupHelpers";
import { fakeFiles, installFakeFileStore, setFakeFiles } from "./fakeFileStore";
import { holdWelcome, realWelcome } from "./launchHelpers";
import { recordLaunchScreen, launchTimes } from "./launchTimes";

const UPDATING = "Nano Buro se met à jour…";
const NOTHING = { edited: false, fileAction: false, backupQuestion: false };

function editor(page: Page) {
  return page.getByRole("textbox", { name: "Document" });
}

function screen(page: Page) {
  return page.locator("#nano-launch");
}

/** Premier lancement avec un texte gardé dans la copie de secours, puis réglage de l'accueil suivant. */
async function relaunchWithDraft(page: Page, text: string, before: () => Promise<void>) {
  await installFakeFileStore(page);
  await page.goto("/");
  await editor(page).click();
  await page.keyboard.type(text);
  await flushBackups(page);
  await before();
  await recordLaunchScreen(page);
  await page.reload();
  await expect(editor(page)).toHaveText(text);
}

type MarkedWindow = { __beforeUpdate?: true };

/** Vrai si la page s'est rechargée dans le délai donné, depuis `markPage`. */
async function wasReloaded(page: Page, timeout: number): Promise<boolean> {
  try {
    await expect
      .poll(
        () =>
          page.evaluate(() => (window as unknown as MarkedWindow).__beforeUpdate).catch(() => true),
        { timeout },
      )
      .toBeUndefined();
  } catch {
    return false;
  }
  await expect(editor(page)).toBeVisible();
  return true;
}

async function markPage(page: Page) {
  await page.evaluate(() => {
    (window as unknown as MarkedWindow).__beforeUpdate = true;
  });
}

test("critère 1 : l'écran est écrit dans index.html, avant le script de l'application et avant le document", async ({
  page,
}) => {
  const html = await (await page.request.get("/")).text();
  const screenAt = html.indexOf('id="nano-launch"');
  expect(screenAt).toBeGreaterThan(0);
  expect(screenAt).toBeLessThan(html.indexOf('id="root"'));
  expect(screenAt).toBeLessThan(html.indexOf("/src/main.tsx"));
  // Ses styles bloquent le premier affichage : ils sont dans <head>, avant tout contenu.
  expect(html.indexOf("launch.css")).toBeLessThan(html.indexOf("</head>"));
  expect(html).toContain('<span class="nano-update-n">N</span>');
  expect(html).toContain(">Nano Buro</h2>");
});

test("critère 1 et 2 : sans le JavaScript, l'écran est déjà là, au style de la charte, avec le N qui tourne, « Nano Buro » et la version", async ({
  page,
}) => {
  // Le script de l'application ne se charge jamais : seul index.html et ses styles sont là.
  await page.route(/\/src\/main\.tsx/, () => new Promise(() => undefined));
  await page.goto("/", { waitUntil: "commit" });
  const box = page.locator("#nano-launch .nano-update");
  await expect(box).toBeVisible();
  await expect(box.locator("h2:visible")).toHaveText("Nano Buro");
  await expect(box.locator(".nano-launch-version")).toHaveText("dev");
  await expect(page.getByText(UPDATING)).toBeHidden();
  const n = box.locator(".nano-update-n");
  await expect(n).toHaveText("N");
  const css = await n.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      family: style.fontFamily,
      weight: style.fontWeight,
      size: style.fontSize,
      animation: style.animationName,
    };
  });
  expect(css).toEqual({
    family: expect.stringContaining("IBM Plex Sans"),
    weight: "600",
    size: "48px",
    animation: "nano-update-spin",
  });
  const version = await box
    .locator(".nano-launch-version")
    .evaluate((element) => [
      getComputedStyle(element).fontFamily,
      getComputedStyle(element).fontSize,
    ]);
  expect(version).toEqual([expect.stringContaining("IBM Plex Mono"), "12px"]);
  // Fond de l'application tant que rien n'est chargé (variable --nano-app-bg).
  const [background, appBg] = await page.evaluate(() => [
    getComputedStyle(document.body).backgroundColor,
    getComputedStyle(document.documentElement).getPropertyValue("--nano-app-bg").trim(),
  ]);
  expect(appBg).not.toBe("");
  expect(background).not.toBe("rgba(0, 0, 0, 0)");
  // Mêmes dimensions qu'une fois l'application chargée (fenêtre de H3 : 420 px de large).
  expect((await box.boundingBox())?.width).toBe(420);
});

test("critère 1 : aucun instant où le document est visible avant l'écran", async ({ page }) => {
  await recordLaunchScreen(page);
  await realWelcome(page);
  await page.goto("/");
  await expect(screen(page)).toHaveCount(0, { timeout: 10_000 });
  const times = await launchTimes(page);
  expect(times.screenAtEditor).toBe(true);
});

test("critère 2 et 7 : pendant l'accueil, « Nano Buro » et la version sous le N, sur la page estompée, en role status et aria-busy", async ({
  page,
}) => {
  await installFakeFileStore(page);
  await holdWelcome(page);
  await page.goto("/");
  await expect(editor(page)).toBeVisible();
  const box = page.locator("#nano-launch .nano-update");
  await expect(box).toHaveAttribute("role", "status");
  await expect(box).toHaveAttribute("aria-busy", "true");
  await expect(box).toHaveAccessibleName("Nano Buro");
  await expect(box).toHaveAccessibleDescription("dev");
  await expect(box.locator(".nano-launch-version")).toHaveText("dev");
  // La page de l'application est derrière, estompée par le fond de la fenêtre (H3).
  await expect(page.locator("#nano-launch .nano-dialog-backdrop")).toHaveCSS("opacity", "0.55");
  expect(
    await page.locator(".nano-app").evaluate((element) => (element as HTMLElement).inert),
  ).toBe(true);
});

test("critère 3 : sans mise à jour, l'écran disparaît 1,5 seconde après son apparition, et le curseur est dans le document", async ({
  page,
}) => {
  await relaunchWithDraft(page, "Brouillon", () => realWelcome(page));
  await expect(screen(page)).toHaveCount(0, { timeout: 10_000 });
  const times = await launchTimes(page);
  const shown = times.removedAt - times.shownAt;
  // Au moins 1,5 s ; au plus 1,5 s après l'affichage du document, si le serveur de développement est lent.
  expect(shown).toBeGreaterThanOrEqual(1_500);
  expect(shown).toBeLessThan(Math.max(1_500, times.editorAt - times.shownAt) + 400);
  // Le document restauré est là, le curseur à sa place (au début) : la frappe y va.
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type("Mon ");
  await expect(editor(page)).toHaveText("Mon Brouillon");
});

test("critère 3 : réseau lent, sans réponse en 3 s l'écran disparaît, et aucune fenêtre ne surgit ensuite", async ({
  page,
}) => {
  await relaunchWithDraft(page, "Brouillon", () => holdWelcome(page, true));
  await expect(screen(page)).toHaveCount(0, { timeout: 10_000 });
  const times = await launchTimes(page);
  expect(times.removedAt - times.shownAt).toBeGreaterThanOrEqual(3_000);
  expect(times.removedAt - times.shownAt).toBeLessThan(3_600);
  // La mise à jour arrive plus tard : elle attend le lancement suivant (H1), sans fenêtre ni rechargement.
  await markPage(page);
  await page.evaluate(() => window.__nanoLaunch?.simulateUpdate());
  await page.waitForTimeout(500);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.locator(".nano-update-n")).toHaveCount(0);
  expect(await wasReloaded(page, 1_500)).toBe(false);
  await expect(editor(page)).toBeFocused();
});

test("critère 4 : une mise à jour trouvée pendant l'écran le change en « se met à jour » sans qu'il disparaisse ni clignote, puis H3", async ({
  page,
}) => {
  await relaunchWithDraft(page, "Brouillon", () => holdWelcome(page, true));
  await expect(screen(page)).toHaveAttribute("data-mode", "welcome");
  await page.evaluate(() => {
    (window as unknown as { __screen?: Element | null }).__screen =
      document.getElementById("nano-launch");
  });
  await markPage(page);
  await page.evaluate(() => window.__nanoLaunch?.simulateUpdate({ holdControl: true }));
  const dialog = page.getByRole("alertdialog", { name: UPDATING });
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await expect(page.locator("#nano-launch h2:visible")).toHaveText(UPDATING);
  // Le même écran, jamais retiré ni masqué depuis le chargement (`removedAt` et `hiddenAt` vides).
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __screen?: Element | null }).__screen ===
        document.getElementById("nano-launch"),
    ),
  ).toBe(true);
  const times = await launchTimes(page);
  expect(times.removedAt).toBe(-1);
  expect(times.hiddenAt).toBe(-1);
  // Puis H3 : la nouvelle version prend la main, la page se recharge, et le message « mis à jour » suit.
  await expect
    .poll(() => page.evaluate(() => typeof window.__nanoLaunch?.takeControl))
    .toBe("function");
  await page.evaluate(() => window.__nanoLaunch?.takeControl?.());
  expect(await wasReloaded(page, 5_000)).toBe(true);
  await expect(page.locator(".nano-update-notice")).toHaveText(
    "Nano Buro a été mis à jour (dev).",
    { timeout: 10_000 },
  );
  await expect(editor(page)).toHaveText("Brouillon");
});

test("critère 4 : après le rechargement de mise à jour, l'écran s'ouvre directement sur « se met à jour »", async ({
  page,
}) => {
  await relaunchWithDraft(page, "Brouillon", () => holdWelcome(page));
  await page.evaluate(() => window.__nanoLaunch?.simulateUpdate({ holdControl: true }));
  await expect(page.getByRole("alertdialog", { name: UPDATING })).toBeVisible();
  // Le script de la page rechargée ne se charge jamais : on voit ce qu'écrit index.html seul.
  await page.route(/\/src\/main\.tsx/, () => new Promise(() => undefined));
  await expect
    .poll(() => page.evaluate(() => typeof window.__nanoLaunch?.takeControl))
    .toBe("function");
  await page.evaluate(() => window.__nanoLaunch?.takeControl?.());
  await expect(page.locator("#nano-launch")).toHaveAttribute("data-mode", "updating");
  await expect(page.locator("#nano-launch h2:visible")).toHaveText(UPDATING);
});

test("critère 5 : pendant l'écran, ni frappe, ni clic, ni raccourci n'atteignent le document, et rien n'est perdu ni envoyé", async ({
  page,
}) => {
  await relaunchWithDraft(page, "Brouillon", () => holdWelcome(page));
  await expect(screen(page)).toBeVisible();
  await expect(page.locator("#nano-launch .nano-update")).toBeFocused();
  const callsBefore = (await fakeFiles(page)).calls;
  const editorBox = await editor(page).boundingBox();
  if (!editorBox) throw new Error("éditeur sans dimensions");
  await page.mouse.click(editorBox.x + 20, editorBox.y + 10);
  await page.keyboard.type("perdu");
  await page.keyboard.press("Control+s");
  await page.keyboard.press("Control+f");
  await page.keyboard.press("Control+Shift+Digit1");
  await page.keyboard.press("Enter");
  await expect(editor(page)).toHaveText("Brouillon");
  expect((await fakeFiles(page)).calls).toEqual(callsBefore);
  await expect(page.getByRole("searchbox", { includeHidden: true })).toHaveCount(0);
  // L'accueil fini, rien de ce qui a été tapé n'arrive en retard dans le document.
  await page.evaluate(() => window.__nanoLaunch?.finishUpdateCheck());
  await expect(screen(page)).toHaveCount(0);
  await expect(editor(page)).toHaveText("Brouillon");
  expect(await page.evaluate(() => window.__nanoLaunch?.activity())).toEqual(NOTHING);
  await page.keyboard.press("End");
  await page.keyboard.type(" suite");
  await expect(editor(page)).toHaveText("Brouillon suite");
});

test("critère 7 : moins d'animations demandé, le N de l'accueil pulse doucement au lieu de tourner", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installFakeFileStore(page);
  await holdWelcome(page);
  await page.goto("/");
  const n = page.locator("#nano-launch .nano-update-n");
  await expect(n).toBeVisible();
  const style = await n.evaluate((element) => ({
    animation: getComputedStyle(element).animationName,
    transform: getComputedStyle(element).transform,
  }));
  expect(style).toEqual({ animation: "nano-update-pulse", transform: "none" });
});

test("critère 8 : l'écran ne revient ni pendant le travail, ni à « Nouveau », ni à l'ouverture d'un fichier", async ({
  page,
}) => {
  await recordLaunchScreen(page);
  await installFakeFileStore(page);
  await page.goto("/");
  await expect(screen(page)).toHaveCount(0);
  await editor(page).click();
  await page.keyboard.type("Texte");
  page.on("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Nouveau", exact: true }).click();
  await expect(editor(page)).toHaveText("");
  const json: DocumentJson = { type: "doc", content: [paragraph("p-1", { text: "Lettre" })] };
  await setFakeFiles(page, {
    files: {
      "lettre.nano": serializeDocument({ id: crypto.randomUUID(), ydoc: ydocFromJson(json) }),
    },
    nextOpen: "lettre.nano",
  });
  await page.getByRole("button", { name: "Ouvrir…", exact: true }).click();
  await expect(editor(page)).toHaveText("Lettre");
  await page.waitForTimeout(300);
  await expect(screen(page)).toHaveCount(0);
  await expect(page.locator(".nano-update-n")).toHaveCount(0);
  expect((await launchTimes(page)).shownAgain).toBe(false);
});

test("critère 9 : en développement, l'accueil se ferme dès que le document est affiché, sans attendre 1,5 s", async ({
  page,
}) => {
  await recordLaunchScreen(page);
  await installFakeFileStore(page);
  await page.goto("/");
  await expect(screen(page)).toHaveCount(0);
  const times = await launchTimes(page);
  expect(times.removedAt - times.editorAt).toBeLessThan(200);
});
