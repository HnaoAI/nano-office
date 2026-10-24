// Tests d'interface du ticket T2.12 (liens), dans Chromium : fenêtre « Lien » (bouton et Ctrl/Cmd+K), adresses
// refusées, affichage, clic et Ctrl/Cmd+clic, bulle, aucune mise en forme à la frappe, collages, enregistrement,
// PDF cliquable, réseau, annulation. `window.open` est remplacé par un journal : aucun onglet ne s'ouvre.
import { expect, test, type Page } from "@playwright/test";
import {
  button,
  editor,
  MAC_USER_AGENT,
  pasteFromOtherApp,
  readClipboard,
  saveAndReopen,
  selectText,
  settleSelection,
  start,
  topBlocks,
  waitUndoGroup,
  WINDOWS_USER_AGENT,
} from "./formatHelpers";
import { suspiciousTraffic, watchNetwork } from "./networkWatch";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

declare global {
  interface Window {
    __opened?: [string | URL | undefined, string | undefined, string | undefined][];
  }
}

/** Remplace `window.open` par un journal, avant le chargement de la page. */
async function recordOpen(page: Page) {
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = (url, target, features) => {
      window.__opened?.push([url, target, features]);
      return null;
    };
  });
}

async function opened(page: Page) {
  return page.evaluate(() => window.__opened ?? []);
}

function linkForm(page: Page) {
  return page.getByRole("form", { name: "Lien" });
}

function bubble(page: Page) {
  return page.locator(".nano-link-bubble");
}

/** Ouvre la fenêtre « Lien » par le bouton, tape l'adresse et valide. */
async function addLink(page: Page, address: string) {
  await button(page, "Lien").click();
  await linkForm(page).getByRole("textbox").fill(address);
  await linkForm(page).getByRole("textbox").press("Enter");
}

/** Liens du document : texte et adresse. */
async function documentLinks(page: Page): Promise<[string, string][]> {
  const found: [string, string][] = [];
  const walk = (node: unknown) => {
    if (typeof node !== "object" || node === null) return;
    const value = node as {
      text?: string;
      marks?: { type: string; attrs?: { href?: string } }[];
      content?: unknown[];
    };
    const href = value.marks?.find((mark) => mark.type === "link")?.attrs?.href;
    if (value.text !== undefined && href) found.push([value.text, href]);
    value.content?.forEach(walk);
  };
  (await topBlocks(page)).forEach(walk);
  return found;
}

test("critère 1 : le bouton « Lien » ouvre la fenêtre ; l'adresse sans https:// le reçoit", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Voir le site de l'école");
  await selectText(page, "le site");
  await expect(button(page, "Lien").locator("svg")).toBeVisible();
  await addLink(page, "ecole.fr");
  await expect(linkForm(page)).toHaveCount(0);
  await expect(editor(page).locator("a")).toHaveText("le site");
  expect(await documentLinks(page)).toEqual([["le site", "https://ecole.fr"]]);
  await expect(editor(page)).toBeFocused();
});

for (const [platform, userAgent, keys] of [
  ["Windows", WINDOWS_USER_AGENT, "Control+KeyK"],
  ["Mac", MAC_USER_AGENT, "Meta+KeyK"],
] as const) {
  test.describe(platform, () => {
    test.use({ userAgent });
    test(`critère 1 : ${keys} ouvre la fenêtre « Lien », Échap la ferme et rend le curseur au texte`, async ({
      page,
    }) => {
      await start(page);
      await page.keyboard.type("Le site");
      await selectText(page, "site");
      await page.keyboard.press(keys);
      await expect(linkForm(page).getByRole("textbox")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(linkForm(page)).toHaveCount(0);
      await expect(editor(page)).toBeFocused();
      await page.keyboard.press(keys);
      await page.keyboard.type("exemple.fr");
      await page.keyboard.press("Enter");
      expect(await documentLinks(page)).toEqual([["site", "https://exemple.fr"]]);
    });
  });
}

test("critère 1 : sans sélection, l'adresse est insérée comme texte du lien ; un e-mail devient mailto:", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Écrire à ");
  await page.keyboard.press("ControlOrMeta+KeyK");
  await page.keyboard.type("mamie@exemple.fr");
  await page.keyboard.press("Enter");
  await page.keyboard.type(" demain");
  expect(await documentLinks(page)).toEqual([["mamie@exemple.fr", "mailto:mamie@exemple.fr"]]);
  await expect(editor(page)).toHaveText("Écrire à mamie@exemple.fr demain");
});

test("critère 2 : javascript: et data: sont refusés dans la fenêtre, avec un message clair", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Cliquez ici");
  await selectText(page, "ici");
  for (const refused of ["javascript:alert(1)", "data:text/html,<b>x</b>"]) {
    await button(page, "Lien").click();
    await linkForm(page).getByRole("textbox").fill(refused);
    await linkForm(page).getByRole("button", { name: "Valider" }).click();
    await expect(linkForm(page).getByRole("alert")).toContainText("Adresse refusée");
    await page.keyboard.press("Escape");
  }
  expect(await documentLinks(page)).toEqual([]);
});

test("critère 2 et 5 : un collage du web garde ses liens, jamais javascript: ni data:", async ({
  page,
}) => {
  await start(page);
  await pasteFromOtherApp(
    page,
    '<p>Lire <a href="https://fr.wikipedia.org/wiki/Cerf-volant">l\'article</a>, <a href="javascript:alert(1)">piège</a> et <a href="data:text/html,x">données</a>.</p>',
    "Lire l'article, piège et données.",
  );
  await expect(editor(page)).toContainText("piège");
  expect(await documentLinks(page)).toEqual([
    ["l'article", "https://fr.wikipedia.org/wiki/Cerf-volant"],
  ]);
});

test("critère 3 : souligné en bleu #1565C0 ; un clic place le curseur, Ctrl/Cmd+clic ouvre un nouvel onglet", async ({
  page,
}) => {
  await recordOpen(page);
  await start(page);
  await page.keyboard.type("Voir le site");
  await selectText(page, "site");
  await addLink(page, "exemple.fr");
  const link = editor(page).locator("a");
  const style = await link.evaluate((node) => {
    const computed = getComputedStyle(node);
    return [computed.color, computed.textDecorationLine];
  });
  expect(style).toEqual(["rgb(21, 101, 192)", "underline"]);
  await link.click();
  await expect(editor(page)).toBeFocused();
  expect(await opened(page)).toEqual([]);
  await link.click({ modifiers: ["ControlOrMeta"] });
  expect(await opened(page)).toEqual([["https://exemple.fr", "_blank", "noopener,noreferrer"]]);
});

test("critère 3 : la bulle montre l'adresse, au curseur comme au survol, avec Modifier, Retirer le lien et Ouvrir", async ({
  page,
}) => {
  await recordOpen(page);
  await start(page);
  await page.keyboard.type("Voir le site puis la suite");
  await selectText(page, "site");
  await addLink(page, "exemple.fr");
  await page.keyboard.press("End");
  await expect(bubble(page)).toHaveCount(0);
  await selectText(page, "sit");
  await page.keyboard.press("ArrowLeft");
  await expect(bubble(page)).toContainText("https://exemple.fr");
  await expect(bubble(page).getByRole("button")).toHaveText([
    "Modifier",
    "Retirer le lien",
    "Ouvrir",
  ]);
  await bubble(page).getByRole("button", { name: "Ouvrir" }).click();
  expect(await opened(page)).toEqual([["https://exemple.fr", "_blank", "noopener,noreferrer"]]);

  await bubble(page).getByRole("button", { name: "Modifier" }).click();
  await expect(linkForm(page).getByRole("textbox")).toHaveValue("https://exemple.fr");
  await linkForm(page).getByRole("textbox").fill("autre.fr");
  await page.keyboard.press("Enter");
  expect(await documentLinks(page)).toEqual([["site", "https://autre.fr"]]);

  // Survol, curseur ailleurs.
  await page.keyboard.press("ControlOrMeta+End");
  await editor(page).locator("a").hover();
  await expect(bubble(page)).toContainText("https://autre.fr");
  await bubble(page).hover();
  await bubble(page).getByRole("button", { name: "Retirer le lien" }).click();
  expect(await documentLinks(page)).toEqual([]);
  await expect(editor(page)).toHaveText("Voir le site puis la suite");
});

test("critère 4 : taper une adresse ne crée pas de lien ; la coller sur une sélection en fait un", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Voir https://exemple.fr et www.ecole.fr puis mon site ");
  expect(await documentLinks(page)).toEqual([]);
  await selectText(page, "mon site");
  await pasteFromOtherApp(page, "", "https://famille.fr");
  expect(await documentLinks(page)).toEqual([["mon site", "https://famille.fr"]]);
  await expect(editor(page)).toContainText("mon site");
});

test("critère 5 : gardés à l'enregistrement, dans un copier-coller interne et dans un PDF cliquable", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Voir le site");
  await selectText(page, "le site");
  await addLink(page, "exemple.fr/page");
  const json = await saveAndReopen(page);
  expect(JSON.stringify(json)).toContain('"href":"https://exemple.fr/page"');
  await expect(editor(page).locator("a")).toHaveText("le site");

  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString("latin1");
  expect(pdf).toContain("https://exemple.fr/page");

  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await settleSelection(page);
  await page.keyboard.press("ControlOrMeta+c");
  const { html } = await readClipboard(page);
  expect(html).toMatch(/<a [^>]*href="https:\/\/exemple\.fr\/page"/);
  await page.keyboard.press("End");
  await settleSelection(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(editor(page).locator("a")).toHaveCount(2);
});

test("critère 6 : écrire, cliquer et survoler un lien n'envoie rien sur le réseau", async ({
  page,
}) => {
  await recordOpen(page);
  const log = watchNetwork(page);
  await start(page);
  await page.keyboard.type("Voir le site secret");
  await selectText(page, "le site");
  await addLink(page, "exemple.fr");
  await editor(page).locator("a").click();
  await editor(page).locator("a").hover();
  await expect(bubble(page)).toBeVisible();
  const origin = new URL(page.url()).origin;
  expect(suspiciousTraffic(log, origin, "secret")).toEqual([]);
  expect(log.requests.filter(({ url }) => url.includes("exemple.fr"))).toEqual([]);
});

test("critère 1 : Ctrl/Cmd+Z annule le lien en une fois", async ({ page }) => {
  await start(page);
  await page.keyboard.type("Voir le site");
  await waitUndoGroup(page);
  await selectText(page, "le site");
  await addLink(page, "exemple.fr");
  await expect(editor(page).locator("a")).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor(page).locator("a")).toHaveCount(0);
  await expect(editor(page)).toHaveText("Voir le site");
});
