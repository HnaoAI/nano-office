// Tests d'interface du ticket T1.5 (copier-coller propre), dans Chromium. Les collages venus d'une
// autre application sont simulés par un événement `paste` portant le HTML et le texte du
// presse-papiers ; les copier-coller internes et Ctrl/Cmd+Shift+V passent par le vrai presse-papiers.
import { expect, test } from "@playwright/test";
import type { DocumentJson } from "../../src/core/types";
import {
  editor,
  pasteFromOtherApp,
  settleSelection,
  start,
  waitUndoGroup,
  ydocJson,
} from "./formatHelpers";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

/** Tous les identifiants de bloc du Y.Doc. */
function blockIds(json: DocumentJson): unknown[] {
  const ids: unknown[] = [];
  const visit = (node: DocumentJson) => {
    if (node.attrs && "id" in node.attrs) ids.push(node.attrs.id);
    node.content?.forEach(visit);
  };
  visit(json);
  return ids;
}

const WEB_EXTRACT = `<h2 style="font-family: Georgia; color: #b00">Les marmottes</h2><p style="font-family: 'Comic Sans MS'; font-size: 24px; background-color: yellow">Elles <b>hibernent</b> six mois, <i>parfois plus</i>.</p><ul><li>Alpes</li><li>Pyrénées</li></ul><img src="https://exemple.fr/marmotte.jpg"><script>window.__pirate = true</script>`;

test("critère 1 : un collage depuis une autre application garde paragraphes, gras, italique, titres et listes", async ({
  page,
}) => {
  const target = await start(page);
  await pasteFromOtherApp(page, WEB_EXTRACT);
  await expect(target.locator("h2")).toHaveText("Les marmottes");
  await expect(target.locator("p strong")).toHaveText("hibernent");
  await expect(target.locator("p em")).toHaveText("parfois plus");
  await expect(target.locator("ul > li")).toHaveText(["Alpes", "Pyrénées"]);
});

test("critère 2 : un collage extérieur perd polices, tailles, couleurs et fonds, et prend la police du document", async ({
  page,
}) => {
  const target = await start(page);
  await pasteFromOtherApp(page, WEB_EXTRACT);
  await expect(target.locator("p strong")).toHaveText("hibernent");
  const styles = await target.locator("h2, p, li, strong, em").evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = getComputedStyle(node);
      return [
        style.fontFamily.split(",")[0]?.replace(/"/g, ""),
        style.color,
        style.backgroundColor,
      ];
    }),
  );
  for (const [font, color, background] of styles) {
    expect(font).toBe("IBM Plex Sans");
    expect(color).toBe("rgb(27, 27, 26)");
    expect(background).toBe("rgba(0, 0, 0, 0)");
  }
  await expect(
    target.locator("[style*='font-family'], [style*='color'], [style*='background']"),
  ).toHaveCount(0);
  expect(JSON.stringify(await ydocJson(page))).not.toMatch(/Georgia|Comic|textStyle/);
});

test("critère 3 : Ctrl/Cmd+Shift+V colle du texte brut, sans mise en forme, en gardant les retours à la ligne", async ({
  page,
}) => {
  const target = await start(page);
  await page.evaluate(async () => {
    const html = new Blob(["<h1>Titre</h1><p><b>gras</b></p>"], { type: "text/html" });
    const text = new Blob(["Titre\ngras\n1. pas une liste"], { type: "text/plain" });
    await navigator.clipboard.write([new ClipboardItem({ "text/html": html, "text/plain": text })]);
  });
  await page.keyboard.press("ControlOrMeta+Shift+v");
  await expect(target.locator("p")).toHaveText(["Titre", "gras", "1. pas une liste"]);
  await expect(target.locator("h1, strong, ol, li")).toHaveCount(0);
});

// Depuis T1.8 (critère 7), un tableau collé reste un tableau : il n'est plus converti en texte.
test("critère 4 : images, vidéos et scripts sont ignorés, un tableau reste un tableau (T1.8), sans erreur", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const target = await start(page);
  await pasteFromOtherApp(
    page,
    `<p>Avant</p><img src="https://exemple.fr/a.png" onerror="window.__pirate = true"><video src="b.mp4"></video><table><tr><td>Case 1</td><td>Case 2</td></tr></table><script>window.__pirate = true</script><p>Après</p>`,
  );
  await expect(target).toContainText("Avant");
  await expect(target).toContainText("Case 1");
  await expect(target).toContainText("Après");
  await expect(target.locator("img, video, script")).toHaveCount(0);
  await expect(target.locator("table td")).toHaveText(["Case 1", "Case 2"]);
  expect(await page.evaluate(() => (window as { __pirate?: boolean }).__pirate)).toBeUndefined();
  expect(errors).toEqual([]);
});

test("critère 5 et 8 : un copier-coller dans Nano Buro garde toute la mise en forme, et donne de nouveaux identifiants", async ({
  page,
}) => {
  const target = await start(page);
  await page.getByRole("combobox", { name: "Police" }).selectOption("EB Garamond");
  await page.getByRole("combobox", { name: "Taille" }).selectOption("20");
  await page.keyboard.type("Garamond 20 ");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type("gras");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.press("ControlOrMeta+Shift+KeyE");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+Shift+Digit7");
  await page.keyboard.type("étape");
  await page.keyboard.press("ControlOrMeta+a");
  await settleSelection(page);
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+End");
  await settleSelection(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+v");

  await expect(target.locator("ol > li")).toHaveText(["étape", "étape"]);
  const garamond = target.locator("span[data-font='EB Garamond']");
  await expect(garamond).toHaveCount(2);
  await expect(garamond.last()).toHaveAttribute("style", /font-size: 20pt/);
  await expect(target.locator("p[style*='center']")).toHaveCount(4);
  await expect(target.locator("strong")).toHaveCount(2);

  const ids = blockIds(await ydocJson(page));
  for (const id of ids) expect(id).toBeTruthy();
  expect(new Set(ids).size).toBe(ids.length);
});

test("critère 6 : copier depuis Nano Buro donne un HTML standard avec gras, italique et listes", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.press("ControlOrMeta+Shift+Digit8");
  await page.keyboard.type("du ");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type("pain");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.press("ControlOrMeta+i");
  await page.keyboard.type(" frais");
  await page.keyboard.press("ControlOrMeta+a");
  await settleSelection(page);
  await page.keyboard.press("ControlOrMeta+c");
  const { html, text } = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    if (!item) throw new Error("presse-papiers vide");
    return {
      html: await (await item.getType("text/html")).text(),
      text: await (await item.getType("text/plain")).text(),
    };
  });
  expect(html).toMatch(/<ul[^>]*>/);
  expect(html).toMatch(/<li[^>]*>/);
  expect(html).toContain("<strong>pain</strong>");
  expect(html).toContain("<em> frais</em>");
  expect(text).toContain("du pain frais");
});

test("critère 7 : coller l'équivalent de dix pages prend moins d'une seconde et ne fige pas l'éditeur", async ({
  page,
}) => {
  const target = await start(page);
  // Dix pages, environ 5 000 mots : dix parties d'un titre, quatre paragraphes de 130 mots et une
  // liste de deux éléments, avec du gras et de l'italique.
  const sentence =
    "Le <b>chalet</b> est à dix minutes du lac, la <i>propriétaire</i> nous attend ce soir. ";
  const part = (i: number) =>
    `<h2>Partie ${String(i + 1)}</h2>${`<p>${sentence.repeat(10)}</p>`.repeat(4)}<ul><li>un</li><li>deux</li></ul>`;
  const html = Array.from({ length: 10 }, (_, i) => part(i)).join("");
  const elapsed = await page.evaluate((data) => {
    const transfer = new DataTransfer();
    transfer.setData("text/html", data);
    const start = performance.now();
    document
      .querySelector(".nano-editor")
      ?.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }),
      );
    return performance.now() - start;
  }, html);
  expect(elapsed).toBeLessThan(1000);
  await expect(target.locator("h2")).toHaveCount(10);
  await expect(target.locator(":scope > p")).toHaveCount(40);
  // L'éditeur répond toujours : la frappe suivante s'affiche tout de suite.
  await page.keyboard.press("ControlOrMeta+End");
  const typed = await page.evaluate(() => performance.now());
  await page.keyboard.type("fin");
  await expect(target.locator("li").last()).toHaveText("deuxfin");
  expect((await page.evaluate(() => performance.now())) - typed).toBeLessThan(1000);
});

test("critère 9 : Ctrl/Cmd+Z annule un collage en une seule fois", async ({ page }) => {
  const target = await start(page);
  await page.keyboard.type("Déjà là");
  await waitUndoGroup(page);
  await pasteFromOtherApp(page, WEB_EXTRACT);
  await expect(target.locator("ul > li")).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(target.locator("h2, ul, strong")).toHaveCount(0);
  await expect(editor(page)).toHaveText("Déjà là");
});
