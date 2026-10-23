// Tests d'interface du ticket H3 : fenêtre « Nano Buro se met à jour », avec un N qui tourne, qui bloque
// l'application du choix de recharger jusqu'à l'affichage de la nouvelle version. La nouvelle version est
// simulée par `window.__nanoLaunch.simulateUpdate` (H2), en développement : la prise de main retenue
// (`holdControl`) laisse voir la fenêtre avant le rechargement. Le délai de 20 s passe par l'horloge
// simulée de Playwright.
import { expect, test, type Page } from "@playwright/test";
import { flushBackups } from "./backupHelpers";
import { fakeFiles, installFakeFileStore } from "./fakeFileStore";

const TITLE = "Nano Buro se met à jour…";
const REASSURANCE = "Vos documents ne sont pas touchés. Cela prend quelques secondes.";
const UPDATED = "Nano Buro a été mis à jour (dev).";
const RECOVERED_MESSAGE =
  "Ce document a été récupéré depuis la copie de secours de ce navigateur. Enregistrez-le pour le garder dans un fichier.";

function editor(page: Page) {
  return page.getByRole("textbox", { name: "Document" });
}

function updateWindow(page: Page) {
  return page.getByRole("alertdialog", { name: TITLE });
}

function notice(page: Page) {
  return page.locator(".nano-update-notice");
}

/** Lance l'application avec un document restauré (lot B), comme à chaque lancement après un premier texte. */
async function relaunchWithDraft(page: Page, text: string) {
  await installFakeFileStore(page);
  await page.goto("/");
  await editor(page).click();
  await page.keyboard.type(text);
  await flushBackups(page);
  await page.reload();
  await expect(editor(page)).toHaveText(text);
}

type MarkedWindow = { __beforeUpdate?: true };

/** Nouvelle version prête, prise de main retenue : la fenêtre reste affichée jusqu'à `takeControl`. */
async function simulateHeldUpdate(page: Page) {
  await page.evaluate(() => {
    (window as unknown as MarkedWindow).__beforeUpdate = true;
    window.__nanoLaunch?.simulateUpdate({ holdControl: true });
  });
}

/** La nouvelle version prend la main, une fois la décision de recharger prise. */
async function takeControl(page: Page) {
  await expect
    .poll(() => page.evaluate(() => typeof window.__nanoLaunch?.takeControl))
    .toBe("function");
  await page.evaluate(() => window.__nanoLaunch?.takeControl?.());
}

/** Vrai si la page marquée par `simulateHeldUpdate` s'est rechargée dans le délai donné. */
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

test("critère 1 et 2 : la fenêtre s'affiche avant le rechargement, centrée, avec le N, le titre et le texte discret", async ({
  page,
}) => {
  await relaunchWithDraft(page, "Brouillon");
  await simulateHeldUpdate(page);
  const dialog = updateWindow(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(TITLE);
  await expect(dialog).toContainText(REASSURANCE);
  // Pas encore rechargée : la fenêtre précède le rechargement.
  expect(await page.evaluate(() => (window as unknown as MarkedWindow).__beforeUpdate)).toBe(true);
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error("fenêtre ou page sans dimensions");
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(2);
  const n = dialog.locator(".nano-update-n");
  await expect(n).toHaveText("N");
  const css = await n.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      family: style.fontFamily,
      weight: style.fontWeight,
      size: style.fontSize,
      color: style.color,
      animation: style.animationName,
      duration: style.animationDuration,
      iterations: style.animationIterationCount,
    };
  });
  expect(css).toEqual({
    family: expect.stringContaining("IBM Plex Sans"),
    weight: "600",
    size: "48px",
    color: "rgb(18, 18, 18)",
    animation: "nano-update-spin",
    duration: "1.6s",
    iterations: "infinite",
  });
});

test("critère 2 : le N tourne sur son axe vertical (rotation 3D rotateY)", async ({ page }) => {
  await relaunchWithDraft(page, "Brouillon");
  await simulateHeldUpdate(page);
  const n = updateWindow(page).locator(".nano-update-n");
  await expect(n).toBeVisible();
  // Une rotation autour de l'axe vertical change la largeur apparente (cos) sans toucher la hauteur.
  await expect
    .poll(() => n.evaluate((element) => getComputedStyle(element).transform))
    .toMatch(/^matrix3d\(/);
  const frames = await n.evaluate((element) =>
    element
      .getAnimations()
      .flatMap((animation) =>
        (animation.effect as KeyframeEffect).getKeyframes().map((frame) => String(frame.transform)),
      ),
  );
  expect(frames).toEqual(["rotateY(0deg)", "rotateY(360deg)"]);
});

test("critère 3 : pendant la mise à jour, ni frappe, ni clic, ni raccourci n'atteignent l'éditeur ou les boutons", async ({
  page,
}) => {
  await relaunchWithDraft(page, "Brouillon");
  await simulateHeldUpdate(page);
  await expect(updateWindow(page)).toBeVisible();
  // Le focus est dans la fenêtre, et le reste de la page est inerte.
  await expect(updateWindow(page)).toBeFocused();
  expect(
    await page.locator(".nano-app").evaluate((element) => (element as HTMLElement).inert),
  ).toBe(true);
  const callsBefore = (await fakeFiles(page)).calls;
  // Clic sur l'éditeur puis frappe : rien n'est écrit.
  const editorBox = await editor(page).boundingBox();
  if (!editorBox) throw new Error("éditeur sans dimensions");
  await page.mouse.click(editorBox.x + 20, editorBox.y + 10);
  await page.keyboard.type("perdu");
  // Clic sur « Ouvrir… » : le sélecteur ne s'ouvre pas.
  const openBox = await page
    .getByRole("button", { name: "Ouvrir…", includeHidden: true })
    .boundingBox();
  if (openBox)
    await page.mouse.click(openBox.x + openBox.width / 2, openBox.y + openBox.height / 2);
  // Raccourcis : enregistrer, imprimer, rechercher.
  await page.keyboard.press("Control+s");
  await page.keyboard.press("Control+f");
  await page.keyboard.press("Control+Shift+Digit1");
  await expect(editor(page)).toHaveText("Brouillon");
  expect((await fakeFiles(page)).calls).toEqual(callsBefore);
  await expect(page.getByRole("searchbox", { includeHidden: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__nanoLaunch?.activity())).toEqual({
    edited: false,
    fileAction: false,
    backupQuestion: false,
  });
});

test("critère 8 : la fenêtre est accessible (alertdialog, aria-busy, texte lu)", async ({
  page,
}) => {
  await relaunchWithDraft(page, "Brouillon");
  await simulateHeldUpdate(page);
  const dialog = updateWindow(page);
  await expect(dialog).toHaveAttribute("aria-busy", "true");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAccessibleName(TITLE);
  await expect(dialog).toHaveAccessibleDescription(REASSURANCE);
});

test("critères 1, 6 et 9 : la nouvelle version s'affiche ensuite, avec le document restauré, son message, et le message « mis à jour »", async ({
  page,
}) => {
  await relaunchWithDraft(page, "Brouillon élève 😀");
  await expect(page.getByRole("status")).toHaveText(RECOVERED_MESSAGE);
  await simulateHeldUpdate(page);
  await expect(updateWindow(page)).toBeVisible();
  await takeControl(page);
  expect(await wasReloaded(page, 5_000)).toBe(true);
  await expect(updateWindow(page)).toHaveCount(0);
  await expect(notice(page)).toHaveText(UPDATED);
  // Critère 9 : le document restauré revient à l'identique, avec son message.
  await expect(editor(page)).toHaveText("Brouillon élève 😀");
  await expect(page.getByRole("status")).toHaveText(RECOVERED_MESSAGE);
  // L'application n'est plus bloquée.
  expect(
    await page.locator(".nano-app").evaluate((element) => (element as HTMLElement).inert),
  ).toBe(false);
});

test("critère 6 : le message « mis à jour » se ferme avec son bouton, et ne revient pas au rechargement suivant", async ({
  page,
}) => {
  await relaunchWithDraft(page, "Brouillon");
  await simulateHeldUpdate(page);
  await takeControl(page);
  expect(await wasReloaded(page, 5_000)).toBe(true);
  await page.getByRole("button", { name: "Fermer l'information de mise à jour" }).click();
  await expect(notice(page)).toHaveCount(0);
  await page.reload();
  await expect(editor(page)).toHaveText("Brouillon");
  await expect(notice(page)).toHaveCount(0);
});

test("critère 6 : le message « mis à jour » disparaît seul à la première frappe", async ({
  page,
}) => {
  await relaunchWithDraft(page, "Brouillon");
  await simulateHeldUpdate(page);
  await takeControl(page);
  expect(await wasReloaded(page, 5_000)).toBe(true);
  await expect(notice(page)).toBeVisible();
  await editor(page).click();
  await page.keyboard.press("End");
  await expect(notice(page)).toHaveCount(0);
  await page.keyboard.type(" suite");
  await expect(editor(page)).toHaveText("Brouillon suite");
});

test("critère 4 : pas de fenêtre si une frappe a eu lieu, et rien ne bloque l'utilisateur", async ({
  page,
}) => {
  await relaunchWithDraft(page, "Brouillon");
  await editor(page).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" suite");
  await simulateHeldUpdate(page);
  // La décision est prise à l'effet suivant : on laisse le temps à une fenêtre de s'afficher.
  await page.waitForTimeout(500);
  await expect(updateWindow(page)).toHaveCount(0);
  await page.keyboard.type(" encore");
  await expect(editor(page)).toHaveText("Brouillon suite encore");
  expect(await wasReloaded(page, 1_000)).toBe(false);
});

test("critère 5 : sans nouvelle version au bout de 20 s, la fenêtre se ferme, Nano Buro se débloque et ne se recharge plus", async ({
  page,
}) => {
  await page.clock.install();
  await relaunchWithDraft(page, "Brouillon");
  await simulateHeldUpdate(page);
  await expect(updateWindow(page)).toBeVisible();
  await page.clock.fastForward(19_000);
  await expect(updateWindow(page)).toBeVisible();
  await page.clock.fastForward(1_000);
  await expect(updateWindow(page)).toHaveCount(0);
  await editor(page).press("End");
  await page.keyboard.type(" suite");
  await expect(editor(page)).toHaveText("Brouillon suite");
  // Une prise de main tardive ne recharge plus : la mise à jour attend le lancement suivant.
  await takeControl(page);
  expect(await wasReloaded(page, 2_000)).toBe(false);
  await expect(notice(page)).toHaveCount(0);
});

test("critère 7 : si le système demande moins d'animations, le N ne tourne pas, il pulse doucement", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await relaunchWithDraft(page, "Brouillon");
  await simulateHeldUpdate(page);
  const n = updateWindow(page).locator(".nano-update-n");
  await expect(n).toBeVisible();
  const style = await n.evaluate((element) => ({
    animation: getComputedStyle(element).animationName,
    transform: getComputedStyle(element).transform,
  }));
  expect(style).toEqual({ animation: "nano-update-pulse", transform: "none" });
});
