// Tests d'interface du ticket T1.9 (images, format .nano version 2), dans Chromium.
import { expect, test, type Page } from "@playwright/test";
import { serializeDocument } from "../../src/core/fileFormat";
import { paragraph, ydocFromJson } from "../core/helpers";
import { flushBackups } from "./backupHelpers";
import { fakeFiles, setFakeFiles } from "./fakeFileStore";
import {
  button,
  editor,
  pasteFromOtherApp,
  saveAndReopen,
  start,
  topBlocks,
  waitUndoGroup,
} from "./formatHelpers";
import {
  decodedSize,
  dropFiles,
  expectImagesLoaded,
  insertWithButton,
  makeImage,
  pasteFiles,
  savedFile,
  shownImages,
} from "./imageHelpers";
import { suspiciousTraffic, watchNetwork } from "./networkWatch";

/** Blocs de premier niveau, réduits à leur type. */
async function blockTypes(page: Page): Promise<string[]> {
  return (await topBlocks(page)).map((block) => block.type);
}

/** Attributs de la première image du document. */
async function firstImageAttrs(page: Page): Promise<Record<string, unknown>> {
  const image = (await topBlocks(page)).find((block) => block.type === "image");
  return image?.attrs ?? {};
}

/** Enregistre le document et attend la fin de l'écriture. */
async function save(page: Page) {
  await button(page, "Enregistrer").click();
  await expect.poll(async () => (await fakeFiles(page)).files["document.nano"]).toBeTruthy();
  await expect(page.locator(".nano-save-state-saved")).toBeVisible();
}

test("critère 1 : « Insérer une image » ouvre le sélecteur de fichiers et insère l'image ; le texte de remplacement est le nom du fichier (critère 5)", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Notre maison");
  const photo = await makeImage(page, "Maison de vacances.jpg", {
    width: 400,
    height: 300,
    type: "image/jpeg",
  });
  await insertWithButton(page, [photo]);
  await expectImagesLoaded(page, 1);
  expect(await blockTypes(page)).toEqual(["paragraph", "image", "paragraph"]);
  expect(await firstImageAttrs(page)).toMatchObject({ alt: "Maison de vacances" });
  await expect(shownImages(page)).toHaveAttribute("alt", "Maison de vacances");
  // Le curseur est sous l'image : on continue à écrire.
  await page.keyboard.type("La suite");
  expect((await topBlocks(page))[2]?.content?.[0]?.text).toBe("La suite");
});

test("critère 1 : une image se dépose par glisser-déposer d'un fichier", async ({ page }) => {
  await start(page);
  await page.keyboard.type("Premier paragraphe");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second paragraphe");
  const logo = await makeImage(page, "logo.png", { width: 120, height: 80, type: "image/png" });
  await dropFiles(page, [logo], "Premier paragraphe");
  await expectImagesLoaded(page, 1);
  expect(await blockTypes(page)).toEqual(["paragraph", "image", "paragraph"]);
  expect(await firstImageAttrs(page)).toMatchObject({ alt: "logo" });
});

test("critère 1 : une image copiée se colle, sans texte de remplacement inventé", async ({
  page,
}) => {
  await start(page);
  const image = await makeImage(page, "image.png", { width: 200, height: 100, type: "image/png" });
  // Chrome met une image copiée dans le presse-papiers avec un HTML qui la désigne par son adresse.
  await pasteFiles(page, [image], '<img src="https://exemple.invalid/photo.png">');
  await expectImagesLoaded(page, 1);
  expect(await firstImageAttrs(page)).toMatchObject({ alt: "" });
});

test("critère 1 et 2 : un fichier d'un autre format, abîmé ou de plus de 25 Mo est refusé avec un message clair", async ({
  page,
}) => {
  await start(page);
  await insertWithButton(page, [
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("pas une image") },
  ]);
  await expect(page.getByRole("alert")).toContainText("n'est pas une image JPEG, PNG, WebP ou GIF");

  const broken = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, 1),
  ]);
  await insertWithButton(page, [{ name: "abime.png", mimeType: "image/png", buffer: broken }]);
  await expect(page.getByRole("alert")).toContainText("n'a pas pu être lue");

  const huge = Buffer.alloc(25 * 1024 * 1024 + 1, 0);
  Buffer.from([0xff, 0xd8, 0xff]).copy(huge);
  await insertWithButton(page, [{ name: "enorme.jpg", mimeType: "image/jpeg", buffer: huge }]);
  await expect(page.getByRole("alert")).toContainText("plus de 25 Mo");
  expect(await blockTypes(page)).not.toContain("image");
});

test("critère 2 : une grande photo est réduite à 2 000 px et réencodée en JPEG ; une image transparente reste en PNG", async ({
  page,
}) => {
  await start(page);
  const photo = await makeImage(page, "photo.png", {
    width: 3000,
    height: 1500,
    type: "image/png",
  });
  const logo = await makeImage(page, "logo.png", {
    width: 2400,
    height: 2400,
    type: "image/png",
    transparent: true,
    hue: 20,
  });
  await insertWithButton(page, [photo, logo]);
  await expectImagesLoaded(page, 2);
  await save(page);
  const images = Object.values((await savedFile(page)).images);
  expect(images.map((image) => image.type).sort()).toEqual(["image/jpeg", "image/png"]);
  const jpeg = images.find((image) => image.type === "image/jpeg");
  const png = images.find((image) => image.type === "image/png");
  if (!jpeg || !png) throw new Error("images absentes");
  expect(await decodedSize(page, jpeg)).toEqual({ width: 2000, height: 1000 });
  expect(await decodedSize(page, png)).toEqual({ width: 2000, height: 2000 });
});

test("critère 2 : une image déjà petite n'est pas réencodée", async ({ page }) => {
  await start(page);
  const small = await makeImage(page, "petite.jpg", {
    width: 800,
    height: 600,
    type: "image/jpeg",
  });
  await insertWithButton(page, [small]);
  await expectImagesLoaded(page, 1);
  await save(page);
  const [image] = Object.values((await savedFile(page)).images);
  expect(image?.data).toBe(small.buffer.toString("base64"));
});

test("critère 4 : on sélectionne l'image d'un clic, on la redimensionne aux poignées sans dépasser la page, proportions gardées", async ({
  page,
}) => {
  await start(page);
  const photo = await makeImage(page, "photo.jpg", { width: 600, height: 400, type: "image/jpeg" });
  await insertWithButton(page, [photo]);
  await expectImagesLoaded(page, 1);
  await shownImages(page).click();
  await expect(page.locator(".nano-image.ProseMirror-selectednode")).toHaveCount(1);

  const handle = page.locator(".nano-image-handle-right");
  /** Tire la poignée de droite de `dx` pixels. */
  const drag = async (dx: number) => {
    const box = await handle.boundingBox();
    if (!box) throw new Error("poignée invisible");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
  };
  const before = await shownImages(page).boundingBox();
  if (!before) throw new Error("image invisible");
  await drag(-150);
  const expected = Math.round(before.width - 150);
  await expect.poll(async () => (await firstImageAttrs(page)).width).toBe(expected);
  const shown = await shownImages(page).boundingBox();
  expect(Math.abs((shown?.width ?? 0) - expected)).toBeLessThanOrEqual(1);
  // Proportions gardées : 600 × 400 au départ.
  expect(Math.abs((shown?.height ?? 0) - (expected * 400) / 600)).toBeLessThanOrEqual(1);

  // Tirée bien au-delà de la page, l'image s'arrête à la largeur de la page.
  const pageWidth = await page.locator(".nano-image").evaluate((node) => node.clientWidth);
  await drag(3000);
  await expect.poll(async () => (await firstImageAttrs(page)).width).toBe(pageWidth);
  expect((await shownImages(page).boundingBox())?.width).toBeLessThanOrEqual(pageWidth);
});

test("critère 4 : l'image s'aligne à gauche, au centre ou à droite avec les boutons d'alignement", async ({
  page,
}) => {
  await start(page);
  await insertWithButton(page, [
    await makeImage(page, "logo.png", { width: 100, height: 100, type: "image/png" }),
  ]);
  await expectImagesLoaded(page, 1);
  await shownImages(page).click();
  await button(page, "Centrer").click();
  await expect(page.locator(".nano-image")).toHaveAttribute("data-align", "center");
  expect(await firstImageAttrs(page)).toMatchObject({ textAlign: "center" });
  await button(page, "Aligner à droite").click();
  await expect(page.locator(".nano-image")).toHaveAttribute("data-align", "right");
  await button(page, "Aligner à gauche").click();
  await expect(page.locator(".nano-image")).toHaveAttribute("data-align", "left");
  // « Gauche » retire l'attribut (alignement par défaut, T1.3) : il disparaît du Y.Doc.
  expect((await firstImageAttrs(page)).textAlign ?? null).toBeNull();
});

test("critère 4 : Retour arrière ou Suppr retire l'image, Ctrl/Cmd+Z la remet", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Texte");
  await insertWithButton(page, [
    await makeImage(page, "logo.png", { width: 100, height: 100, type: "image/png" }),
  ]);
  await expectImagesLoaded(page, 1);
  await waitUndoGroup(page);
  await shownImages(page).click();
  await page.keyboard.press("Backspace");
  await expect(shownImages(page)).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Z");
  await expectImagesLoaded(page, 1);

  await waitUndoGroup(page);
  await shownImages(page).click();
  await page.keyboard.press("Delete");
  await expect(shownImages(page)).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Z");
  await expectImagesLoaded(page, 1);
  expect(await editor(page).textContent()).toContain("Texte");
});

test("critère 5 : le texte de remplacement se modifie, accents et emojis compris", async ({
  page,
}) => {
  await start(page);
  await insertWithButton(page, [
    await makeImage(page, "IMG_0042.jpg", { width: 300, height: 200, type: "image/jpeg" }),
  ]);
  await expectImagesLoaded(page, 1);
  await expect(button(page, "Texte de remplacement")).toHaveCount(0);
  await shownImages(page).click();
  await button(page, "Texte de remplacement").click();
  const field = page.getByLabel("Texte de remplacement", { exact: true }).last();
  await expect(field).toHaveValue("IMG_0042");
  await field.fill("Mémé à la plage 👵🏽🌊");
  await page.keyboard.press("Enter");
  await expect(shownImages(page)).toHaveAttribute("alt", "Mémé à la plage 👵🏽🌊");
  expect(await firstImageAttrs(page)).toMatchObject({ alt: "Mémé à la plage 👵🏽🌊" });
});

test("critère 6 : enregistrement puis réouverture ; une image insérée deux fois n'est rangée qu'une fois", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Deux fois la même");
  const logo = await makeImage(page, "logo.png", { width: 150, height: 150, type: "image/png" });
  await insertWithButton(page, [logo]);
  await insertWithButton(page, [logo]);
  await expectImagesLoaded(page, 2);
  const reopened = await saveAndReopen(page);
  await expectImagesLoaded(page, 2);
  const file = await savedFile(page);
  expect(file.version).toBe(2);
  expect(Object.keys(file.images)).toHaveLength(1);
  expect(file.ydoc.length).toBeLessThan(logo.buffer.length);
  const images = (reopened.content ?? []).filter((block) => block.type === "image");
  expect(images).toHaveLength(2);
  expect(images[0]?.attrs?.id).not.toBe(images[1]?.attrs?.id);
});

test("critère 6 : une image retirée du document n'est plus enregistrée", async ({ page }) => {
  await start(page);
  await insertWithButton(page, [
    await makeImage(page, "a.png", { width: 100, height: 100, type: "image/png", hue: 10 }),
    await makeImage(page, "b.png", { width: 100, height: 100, type: "image/png", hue: 200 }),
  ]);
  await expectImagesLoaded(page, 2);
  await shownImages(page).first().click();
  await page.keyboard.press("Delete");
  await expect(shownImages(page)).toHaveCount(1);
  await save(page);
  expect(Object.keys((await savedFile(page)).images)).toHaveLength(1);
});

test("critère 7 : un fichier version 1 s'ouvre tel quel et s'enregistre en version 2", async ({
  page,
}) => {
  await start(page);
  const ydoc = ydocFromJson({
    type: "doc",
    content: [paragraph("p-1", { text: "Lettre de 2025 ✉️" })],
  });
  const v2 = JSON.parse(serializeDocument({ id: "doc-ancien", ydoc })) as Record<string, unknown>;
  const v1 = JSON.stringify({ ...v2, version: 1, images: undefined });
  await setFakeFiles(page, { files: { "ancien.nano": v1 }, nextOpen: "ancien.nano" });
  await button(page, "Ouvrir…").click();
  await expect(editor(page)).toContainText("Lettre de 2025 ✉️");
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" Relue.");
  await button(page, "Enregistrer").click();
  await expect
    .poll(
      async () =>
        JSON.parse((await fakeFiles(page)).files["ancien.nano"] ?? "{}") as { version?: number },
    )
    .toMatchObject({ version: 2, id: "doc-ancien", images: {} });
});

test("critère 8 : un rechargement restaure les images depuis la copie de secours", async ({
  page,
}) => {
  await start(page);
  await insertWithButton(page, [
    await makeImage(page, "photo.jpg", { width: 500, height: 300, type: "image/jpeg" }),
  ]);
  await expectImagesLoaded(page, 1);
  await flushBackups(page);
  await page.reload();
  await expect(page.getByRole("status")).toContainText("copie de secours");
  await expectImagesLoaded(page, 1);
  expect(await firstImageAttrs(page)).toMatchObject({ alt: "photo" });
});

test("critère 9 : une image sans contenu dans le fichier affiche « Image manquante », le reste s'ouvre", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Avant");
  await insertWithButton(page, [
    await makeImage(page, "photo.jpg", { width: 200, height: 100, type: "image/jpeg" }),
  ]);
  await expectImagesLoaded(page, 1);
  await page.keyboard.type("Après");
  await save(page);
  const file = await savedFile(page);
  await setFakeFiles(page, {
    files: { "abime.nano": JSON.stringify({ ...file, id: "autre-doc", images: {} }) },
    nextOpen: "abime.nano",
  });
  await button(page, "Ouvrir…").click();
  await expect(page.locator(".nano-image-missing")).toHaveText("Image manquante");
  await expect(editor(page)).toContainText("Avant");
  await expect(editor(page)).toContainText("Après");
});

test("critère 10 : rien ne part sur le réseau ; une image http collée est ignorée et son texte collé", async ({
  page,
  baseURL,
}) => {
  const log = watchNetwork(page);
  await start(page);
  await insertWithButton(page, [
    await makeImage(page, "secret.png", { width: 300, height: 300, type: "image/png" }),
  ]);
  await expectImagesLoaded(page, 1);
  await pasteFromOtherApp(
    page,
    '<p>Texte du web <img src="http://exemple.invalid/suivi.png"> et la suite</p>',
    "Texte du web et la suite",
  );
  await expect(editor(page)).toContainText("Texte du web");
  await expect(editor(page)).toContainText("et la suite");
  await expect(shownImages(page)).toHaveCount(1);
  await save(page);
  const origin = new URL(baseURL ?? page.url()).origin;
  expect(log.requests.filter((request) => request.url.includes("exemple.invalid"))).toEqual([]);
  const [data] = Object.values((await savedFile(page)).images).map((image) => image.data);
  expect(suspiciousTraffic(log, origin, data?.slice(0, 40) ?? "")).toEqual([]);
});

test("critère 10 : une image collée avec son contenu (data:) est gardée", async ({ page }) => {
  await start(page);
  const logo = await makeImage(page, "logo.png", { width: 64, height: 64, type: "image/png" });
  await pasteFromOtherApp(
    page,
    `<p>Logo :</p><img src="data:image/png;base64,${logo.buffer.toString("base64")}" alt="Logo du club">`,
  );
  await expectImagesLoaded(page, 1);
  expect(await firstImageAttrs(page)).toMatchObject({ alt: "Logo du club" });
});

test("critère 11 : un document de 20 photos reste fluide et s'enregistre", async ({ page }) => {
  await start(page);
  const photos = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      makeImage(page, `photo-${String(index + 1)}.jpg`, {
        width: 1600,
        height: 1200,
        type: "image/jpeg",
        hue: index * 17,
      }),
    ),
  );
  await insertWithButton(page, photos);
  await expectImagesLoaded(page, 20);
  await page.keyboard.type("Fin de l'album");
  await expect(editor(page)).toContainText("Fin de l'album");
  const started = Date.now();
  await save(page);
  expect(Date.now() - started).toBeLessThan(5000);
  expect(Object.keys((await savedFile(page)).images)).toHaveLength(20);
});

test("relecture : un document qui commence par une image se rouvre sans que la première touche la remplace", async ({
  page,
}) => {
  await start(page);
  await insertWithButton(page, [
    await makeImage(page, "logo.png", { width: 120, height: 80, type: "image/png" }),
  ]);
  await expectImagesLoaded(page, 1);
  await page.keyboard.type("Lettre");
  await saveAndReopen(page);
  await expectImagesLoaded(page, 1);
  await page.keyboard.type("X");
  expect(await blockTypes(page)).toEqual(["image", "paragraph"]);
  expect((await topBlocks(page))[1]?.content?.[0]?.text).toBe("XLettre");
});

test("relecture : Ctrl/Cmd+Shift+V colle du texte brut, sans image, même avec une image data: (T1.5)", async ({
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await start(page);
  const logo = await makeImage(page, "logo.png", { width: 64, height: 64, type: "image/png" });
  const html = `<p>Logo du club</p><img src="data:image/png;base64,${logo.buffer.toString("base64")}" alt="Logo">`;
  await page.evaluate(async (markup) => {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([markup], { type: "text/html" }),
        "text/plain": new Blob(["Logo du club"], { type: "text/plain" }),
      }),
    ]);
  }, html);
  await page.keyboard.press("ControlOrMeta+Shift+V");
  await expect(editor(page)).toContainText("Logo du club");
  await page.waitForTimeout(300);
  expect(await blockTypes(page)).not.toContain("image");
});

test("relecture : plusieurs images refusées d'un coup donnent un message avec chaque raison", async ({
  page,
}) => {
  await start(page);
  const huge = Buffer.alloc(25 * 1024 * 1024 + 1, 0);
  Buffer.from([0xff, 0xd8, 0xff]).copy(huge);
  await insertWithButton(page, [
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("texte") },
    { name: "enorme.jpg", mimeType: "image/jpeg", buffer: huge },
    await makeImage(page, "bonne.png", { width: 50, height: 50, type: "image/png" }),
  ]);
  await expectImagesLoaded(page, 1);
  await expect(page.getByRole("alert")).toContainText("plus de 25 Mo");
  await expect(page.getByRole("alert")).toContainText("n'est pas une image");
});

test("relecture : une image glissée depuis une autre fenêtre de Nano Buro garde son contenu", async ({
  page,
}) => {
  await start(page);
  await page.keyboard.type("Cible");
  const logo = await makeImage(page, "logo.png", { width: 64, height: 64, type: "image/png" });
  const html = `<img data-nano-buro="" data-pm-slice="0 0 []" data-hash="${"f".repeat(64)}" alt="Logo" src="data:image/png;base64,${logo.buffer.toString("base64")}">`;
  const box = await editor(page).getByText("Cible").boundingBox();
  if (!box) throw new Error("texte invisible");
  await page.evaluate(
    ({ markup, x, y }) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData("text/html", markup);
      const target = document.elementFromPoint(x, y) ?? document.body;
      for (const type of ["dragenter", "dragover", "drop"]) {
        target.dispatchEvent(
          new DragEvent(type, {
            dataTransfer,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    },
    { markup: html, x: box.x + box.width - 2, y: box.y + box.height / 2 },
  );
  await expectImagesLoaded(page, 1);
  await expect(page.locator(".nano-image-missing")).toHaveCount(0);
});
