// Tests d'interface du ticket T3.1 (assistant IA facultatif), dans Chromium, avec de faux fournisseurs
// sur les vraies adresses de Claude et de Gemini (assistantHelpers.ts).
import { expect, test, type Page } from "@playwright/test";
import { fakeFiles } from "./fakeFileStore";
import {
  ANTHROPIC_TEST_KEY,
  enableAssistant,
  fakeProvider,
  GEMINI_TEST_KEY,
  indexedDbDump,
  providerRequests,
} from "./assistantHelpers";
import { flushBackups } from "./backupHelpers";
import {
  button,
  editor,
  selectText,
  settleSelection,
  start,
  waitUndoGroup,
  ydocJson,
} from "./formatHelpers";

const FAULTY = "Les enfant joue dans le jardin.";
const FIXED = "Les enfants jouent dans le jardin.";

/** Texte du Y.Doc, un paragraphe par ligne. */
async function documentText(page: Page): Promise<string> {
  const json = await ydocJson(page);
  return (json.content ?? [])
    .map((block) => (block.content ?? []).map((node) => node.text ?? "").join(""))
    .join("\n");
}

function assistantGroup(page: Page) {
  return page.getByRole("group", { name: "Assistant" });
}

function suggestionBar(page: Page) {
  return page.getByRole("region", { name: "Modifications proposées" });
}

/** Écrit `text` dans le document, le sélectionne en entier et clique sur « Corriger ». */
async function writeAndCorrect(page: Page, text: string) {
  await page.keyboard.type(text);
  await page.keyboard.press("ControlOrMeta+A");
  await button(page, "Corriger").click();
}

test.describe("T3.1 : assistant éteint", () => {
  test("critère 4 : éteint, l'assistant ne laisse aucune trace dans l'interface et ne fait aucune requête", async ({
    page,
  }) => {
    const requests = providerRequests(page);
    await start(page);
    await page.keyboard.type(FAULTY);
    await page.keyboard.press("ControlOrMeta+A");
    await expect(assistantGroup(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Corriger" })).toHaveCount(0);
    const visible = await page.locator("body").innerText();
    expect(visible).not.toMatch(/\bIA\b|Assistant|Corriger|Traduire/);
    // Seul le bouton « Réglages » existe, sans aucun mot visible.
    await expect(button(page, "Réglages")).toBeVisible();
    await expect(button(page, "Réglages")).toHaveText("");
    expect(requests).toEqual([]);
  });
});

test.describe("T3.1 : réglages", () => {
  test("critère 1 : « Réglages » ouvre la boîte, assistant éteint, avec fournisseur, clé masquée et modèle", async ({
    page,
  }) => {
    await start(page);
    await button(page, "Réglages").click();
    const dialog = page.getByRole("dialog", { name: "Réglages" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Assistant IA")).toBeVisible();
    const toggle = dialog.getByRole("switch");
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect(dialog.getByRole("radio", { name: /Claude/ })).toBeChecked();
    const key = dialog.getByLabel("Clé d'API Claude");
    await expect(key).toHaveAttribute("type", "password");
    await expect(dialog.getByLabel("Modèle")).toHaveValue("claude-haiku-5-5");
    // Sans clé, l'assistant ne peut pas être enregistré allumé.
    await expect(dialog.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
    await dialog.getByRole("radio", { name: /Gemini/ }).check();
    await expect(dialog.getByLabel("Modèle")).toHaveValue("gemini-3.5-flash-lite");
  });

  test("critère 2 : à la mise en marche, le texte dit ce qui est envoyé, et à qui", async ({
    page,
  }) => {
    await start(page);
    await button(page, "Réglages").click();
    const dialog = page.getByRole("dialog", { name: "Réglages" });
    await expect(dialog.getByRole("note")).toHaveCount(0);
    await dialog.getByRole("switch").check();
    await expect(dialog.getByRole("note")).toContainText(
      "le texte sélectionné est envoyé à Anthropic, et seulement lui",
    );
    await dialog.getByRole("radio", { name: /Gemini/ }).check();
    const notice = dialog.getByRole("note");
    await expect(notice).toContainText("envoyé à Google");
    await expect(notice).toContainText("l'offre gratuite de Gemini");
    await expect(notice.getByRole("link", { name: "conditions de l'API Gemini" })).toHaveAttribute(
      "href",
      "https://ai.google.dev/gemini-api/terms#unpaid-services",
    );
  });

  test("critère 3 : la clé reste sur cet ordinateur, et « Oublier la clé » l'efface", async ({
    page,
  }) => {
    await start(page);
    await button(page, "Réglages").click();
    let dialog = page.getByRole("dialog", { name: "Réglages" });
    await dialog.getByRole("switch").check();
    await dialog.getByLabel("Clé d'API Claude").fill(ANTHROPIC_TEST_KEY);
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(assistantGroup(page)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("nano-office:assistant-keys"))).toContain(
      ANTHROPIC_TEST_KEY,
    );
    expect(
      await page.evaluate(() => localStorage.getItem("nano-office:assistant-settings")),
    ).not.toContain(ANTHROPIC_TEST_KEY);

    await button(page, "Réglages").click();
    dialog = page.getByRole("dialog", { name: "Réglages" });
    await dialog.getByRole("button", { name: "Oublier la clé" }).click();
    // L'interrupteur suit l'assistant, éteint avec la clé ; rallumé, il ne montre plus aucune clé.
    await expect(dialog.getByRole("switch")).not.toBeChecked();
    await dialog.getByRole("switch").check();
    await expect(dialog.getByLabel("Clé d'API Claude")).toHaveValue("");
    expect(
      await page.evaluate(() => localStorage.getItem("nano-office:assistant-keys")),
    ).toBeNull();
    await dialog.getByRole("button", { name: "Annuler" }).click();
    // Sans clé, l'assistant s'éteint et disparaît.
    await expect(assistantGroup(page)).toHaveCount(0);
  });

  test("critère 3 : la clé n'apparaît jamais dans le fichier enregistré ni dans la copie de secours", async ({
    page,
  }) => {
    await enableAssistant(page);
    await fakeProvider(page, "anthropic", () => ({ paragraphs: [FIXED] }));
    await start(page);
    await writeAndCorrect(page, FAULTY);
    await expect(suggestionBar(page)).toBeVisible();
    await button(page, "Tout accepter").click();
    await button(page, "Enregistrer").click();
    await expect.poll(async () => (await fakeFiles(page)).files["document.nano"]).toBeTruthy();
    const file = (await fakeFiles(page)).files["document.nano"] ?? "";
    expect(file).toContain("enfants");
    for (const secret of [ANTHROPIC_TEST_KEY, GEMINI_TEST_KEY, "assistant"]) {
      expect(file).not.toContain(secret);
    }
    await flushBackups(page);
    // La copie de secours est bien lue (ses mises à jour Yjs nomment les paragraphes) : la recherche
    // de la clé y a donc un sens. Le texte tapé, lui, y est découpé en morceaux.
    const backups = await indexedDbDump(page);
    expect(backups).toContain("paragraph");
    expect(backups).not.toContain(ANTHROPIC_TEST_KEY);
    expect(JSON.stringify(await ydocJson(page))).not.toContain(ANTHROPIC_TEST_KEY);
  });

  test("critère 4 : éteindre l'assistant le fait disparaître", async ({ page }) => {
    await enableAssistant(page);
    await start(page);
    await expect(assistantGroup(page)).toBeVisible();
    await button(page, "Réglages").click();
    const dialog = page.getByRole("dialog", { name: "Réglages" });
    await dialog.getByRole("switch").uncheck();
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(assistantGroup(page)).toHaveCount(0);
    await page.reload();
    await expect(editor(page)).toBeVisible();
    await expect(assistantGroup(page)).toHaveCount(0);
  });
});

test.describe("T3.1 : corriger", () => {
  test("critère 5 : les boutons sont grisés sans sélection et hors ligne", async ({
    page,
    context,
  }) => {
    await enableAssistant(page);
    await start(page);
    await page.keyboard.type(FAULTY);
    await expect(button(page, "Corriger")).toBeDisabled();
    await expect(button(page, "Traduire en anglais")).toBeDisabled();
    await page.keyboard.press("ControlOrMeta+A");
    await expect(button(page, "Corriger")).toBeEnabled();
    await context.setOffline(true);
    await expect(button(page, "Corriger")).toBeDisabled();
    await context.setOffline(false);
    await expect(button(page, "Corriger")).toBeEnabled();
  });

  test("critère 13 : aucune requête sans clic, et seule la sélection est envoyée, avec l'en-tête du navigateur", async ({
    page,
  }) => {
    await enableAssistant(page);
    const calls = await fakeProvider(page, "anthropic", (paragraphs) => ({ paragraphs }));
    await start(page);
    await page.keyboard.type("Un paragraphe privé à ne pas envoyer.");
    await page.keyboard.press("Enter");
    await page.keyboard.type(FAULTY);
    await selectText(page, FAULTY);
    await page.waitForTimeout(300);
    expect(calls).toEqual([]);
    await button(page, "Corriger").click();
    await expect.poll(() => calls.length).toBe(1);
    const [call] = calls;
    expect(call?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call?.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(call?.headers["x-api-key"]).toBe(ANTHROPIC_TEST_KEY);
    expect(call?.paragraphs).toEqual([FAULTY]);
    expect(call?.body).not.toContain("privé");
    expect(call?.body).not.toContain("document.nano");
    expect(call?.body).not.toMatch(/"id"|p-\d|blockId/);
  });

  test("critère 7 : les corrections s'affichent dans le texte sans le modifier", async ({
    page,
  }) => {
    await enableAssistant(page);
    await fakeProvider(page, "anthropic", () => ({ paragraphs: [FIXED] }));
    await start(page);
    await writeAndCorrect(page, FAULTY);
    await expect(suggestionBar(page)).toContainText("2 modifications proposées");
    await expect(editor(page).locator(".nano-suggest-removed")).toHaveText(["enfant", "joue"]);
    await expect(editor(page).locator(".nano-suggest-inserted")).toHaveText(["enfants", "jouent"]);
    expect(await documentText(page)).toBe(FAULTY);
    await expect(page.locator(".nano-save-state-unsaved")).toBeVisible();
  });

  test("critère 8 et 9 : accepter une modification, refuser l'autre, au clic", async ({ page }) => {
    await enableAssistant(page);
    await fakeProvider(page, "anthropic", () => ({ paragraphs: [FIXED] }));
    await start(page);
    await writeAndCorrect(page, FAULTY);
    const actions = page.getByRole("group", { name: /Modification choisie/ });
    await expect(actions).toHaveAccessibleName(
      "Modification choisie : « enfant » remplacé par « enfants »",
    );
    await actions.getByRole("button", { name: "Accepter" }).click();
    await expect.poll(() => documentText(page)).toBe("Les enfants joue dans le jardin.");
    await expect(suggestionBar(page)).toContainText("1 modification proposée");
    await actions.getByRole("button", { name: "Refuser" }).click();
    await expect(suggestionBar(page)).toHaveCount(0);
    expect(await documentText(page)).toBe("Les enfants joue dans le jardin.");
  });

  test("critère 8 : un clic sur une modification la choisit, et la navigation passe à la suivante", async ({
    page,
  }) => {
    await enableAssistant(page);
    await fakeProvider(page, "anthropic", () => ({ paragraphs: [FIXED] }));
    await start(page);
    await writeAndCorrect(page, FAULTY);
    const actions = page.getByRole("group", { name: /Modification choisie/ });
    await editor(page).locator(".nano-suggest-inserted", { hasText: "jouent" }).click();
    await expect(actions).toHaveAccessibleName(/« joue » remplacé par « jouent »/);
    await button(page, "Modification suivante").click();
    await expect(actions).toHaveAccessibleName(/« enfant » remplacé par « enfants »/);
    // Au clavier : Tab jusqu'au bouton « Accepter » de la modification choisie, puis Entrée.
    await actions.getByRole("button", { name: "Accepter" }).focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => documentText(page)).toBe("Les enfants joue dans le jardin.");
  });

  test("critère 9 : tout accepter applique tout, puis un seul Ctrl/Cmd+Z remet le texte", async ({
    page,
  }) => {
    await enableAssistant(page);
    await fakeProvider(page, "anthropic", () => ({
      paragraphs: ["Il est parti.", "Elle est revenue."],
    }));
    await start(page);
    await page.keyboard.type("Il et parti.");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Ell est revenu.");
    await waitUndoGroup(page);
    await page.keyboard.press("ControlOrMeta+A");
    await button(page, "Corriger").click();
    await expect(suggestionBar(page)).toContainText("3 modifications proposées");
    await button(page, "Tout accepter").click();
    await expect.poll(() => documentText(page)).toBe("Il est parti.\nElle est revenue.");
    await editor(page).focus();
    await page.keyboard.press("ControlOrMeta+Z");
    await expect.poll(() => documentText(page)).toBe("Il et parti.\nEll est revenu.");
  });

  test("critère 9 : la mise en forme du texte qui ne change pas est gardée", async ({ page }) => {
    await enableAssistant(page);
    await fakeProvider(page, "anthropic", () => ({ paragraphs: ["Un grand chat noir."] }));
    await start(page);
    await page.keyboard.type("Un ");
    await page.keyboard.press("ControlOrMeta+B");
    await page.keyboard.type("gran");
    await page.keyboard.press("ControlOrMeta+B");
    await page.keyboard.type(" chat noir.");
    await page.keyboard.press("ControlOrMeta+A");
    await button(page, "Corriger").click();
    await button(page, "Tout accepter").click();
    await expect.poll(() => documentText(page)).toBe("Un grand chat noir.");
    const [paragraph] = (await ydocJson(page)).content ?? [];
    expect(paragraph?.content?.map((node) => [node.text, node.marks?.map((m) => m.type)])).toEqual([
      ["Un ", undefined],
      ["grand", ["bold"]],
      [" chat noir.", undefined],
    ]);
  });

  test("critère 10 : les propositions disparaissent si l'on modifie le texte", async ({ page }) => {
    await enableAssistant(page);
    await fakeProvider(page, "anthropic", () => ({ paragraphs: [FIXED] }));
    await start(page);
    await writeAndCorrect(page, FAULTY);
    await expect(suggestionBar(page)).toBeVisible();
    await editor(page).focus();
    await page.keyboard.press("ControlOrMeta+End");
    await settleSelection(page);
    await page.keyboard.type(" Oui.");
    await expect(suggestionBar(page)).toHaveCount(0);
    await expect(editor(page).locator(".nano-suggest-inserted")).toHaveCount(0);
    expect(await documentText(page)).toBe(`${FAULTY} Oui.`);
  });

  test("critère 10 : fermer la barre ou ouvrir un autre document retire les propositions", async ({
    page,
  }) => {
    await enableAssistant(page);
    await fakeProvider(page, "anthropic", () => ({ paragraphs: [FIXED] }));
    await start(page);
    await writeAndCorrect(page, FAULTY);
    await button(page, "Fermer les propositions").click();
    await expect(suggestionBar(page)).toHaveCount(0);
    expect(await documentText(page)).toBe(FAULTY);
    await page.keyboard.press("ControlOrMeta+A");
    await button(page, "Corriger").click();
    await expect(suggestionBar(page)).toBeVisible();
    page.once("dialog", (dialog) => void dialog.accept());
    await button(page, "Nouveau").click();
    await expect(suggestionBar(page)).toHaveCount(0);
  });

  test("critère 11 : un nombre de paragraphes différent propose chaque paragraphe en entier", async ({
    page,
  }) => {
    await enableAssistant(page);
    await fakeProvider(page, "anthropic", () => ({
      paragraphs: ["Un paragraphe. Deux paragraphes."],
    }));
    await start(page);
    await page.keyboard.type("Un paragrafe.");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Deux paragrafes.");
    await page.keyboard.press("ControlOrMeta+A");
    await button(page, "Corriger").click();
    await expect(suggestionBar(page)).toContainText("1 modification proposée");
    await expect(editor(page).locator(".nano-suggest-removed")).toHaveText("Un paragrafe.");
    expect(await documentText(page)).toBe("Un paragrafe.\nDeux paragrafes.");
  });

  test("critère 16 : le texte reçu est inséré comme du texte, jamais comme du HTML", async ({
    page,
  }) => {
    await enableAssistant(page);
    await fakeProvider(page, "anthropic", () => ({
      paragraphs: ['Bonjour <img src=x onerror="window.__piege=1"> !'],
    }));
    await start(page);
    await writeAndCorrect(page, "Bonjour !");
    await expect(suggestionBar(page)).toBeVisible();
    await button(page, "Tout accepter").click();
    await expect
      .poll(() => documentText(page))
      .toBe('Bonjour <img src=x onerror="window.__piege=1"> !');
    await expect(editor(page).locator("img")).toHaveCount(0);
    expect(await page.evaluate(() => (window as { __piege?: number }).__piege)).toBeUndefined();
  });
});

test.describe("T3.1 : traduire", () => {
  test("critère 12 : la traduction s'affiche ; « Remplacer la sélection » s'annule en une fois", async ({
    page,
  }) => {
    await enableAssistant(page, "gemini");
    const calls = await fakeProvider(page, "gemini", () => ({ paragraphs: ["The cat sleeps."] }));
    await start(page);
    await page.keyboard.type("Le chat dort.");
    await waitUndoGroup(page);
    await page.keyboard.press("ControlOrMeta+A");
    await button(page, "Traduire en anglais").click();
    const panel = page.getByRole("region", { name: "Traduction en anglais" });
    await expect(panel).toContainText("The cat sleeps.");
    expect(calls[0]?.url).toContain("generativelanguage.googleapis.com/v1beta/models/");
    expect(calls[0]?.url).not.toContain(GEMINI_TEST_KEY);
    expect(calls[0]?.headers["x-goog-api-key"]).toBe(GEMINI_TEST_KEY);
    expect(await documentText(page)).toBe("Le chat dort.");
    await panel.getByRole("button", { name: "Remplacer la sélection" }).click();
    await expect.poll(() => documentText(page)).toBe("The cat sleeps.");
    await expect(panel).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+Z");
    await expect.poll(() => documentText(page)).toBe("Le chat dort.");
  });

  test("critère 12 : tout sélectionner puis « Remplacer la sélection » garde le titre et les paragraphes", async ({
    page,
  }) => {
    await enableAssistant(page);
    await fakeProvider(page, "anthropic", () => ({
      paragraphs: ["The cat sleeps.", "It dreams."],
    }));
    await start(page);
    await page.keyboard.press("Control+Shift+Digit1");
    await page.keyboard.type("Le chat dort.");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Il rêve.");
    await waitUndoGroup(page);
    await page.keyboard.press("ControlOrMeta+A");
    await button(page, "Traduire en anglais").click();
    const panel = page.getByRole("region", { name: "Traduction en anglais" });
    await panel.getByRole("button", { name: "Remplacer la sélection" }).click();
    await expect.poll(() => documentText(page)).toBe("The cat sleeps.\nIt dreams.");
    const json = await ydocJson(page);
    expect((json.content ?? []).map((block) => block.type)).toEqual(["heading", "paragraph"]);
  });

  test("critère 12 : « Insérer après » ajoute la traduction après la sélection, et « Copier » la copie", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await enableAssistant(page);
    await fakeProvider(page, "anthropic", () => ({ paragraphs: ["Hello."] }));
    await start(page);
    await page.keyboard.type("Bonjour.");
    await page.keyboard.press("ControlOrMeta+A");
    await button(page, "Traduire en anglais").click();
    const panel = page.getByRole("region", { name: "Traduction en anglais" });
    await panel.getByRole("button", { name: "Copier" }).click();
    await expect(panel.getByRole("button", { name: "Copié" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Hello.");
    await panel.getByRole("button", { name: "Insérer après" }).click();
    await expect.poll(() => documentText(page)).toBe("Bonjour.\nHello.");
  });
});

test.describe("T3.1 : erreurs", () => {
  const cases: [string, number, RegExp][] = [
    ["clé refusée", 401, /La clé d'API a été refusée par Anthropic/],
    ["quota dépassé", 429, /quota de votre clé d'API est dépassé/],
    ["service surchargé", 529, /surchargé ou indisponible/],
  ];
  for (const [name, status, expected] of cases) {
    test(`critère 14 : ${name} donne un message clair, sans rien modifier`, async ({ page }) => {
      await enableAssistant(page);
      await fakeProvider(page, "anthropic", () => ({ status }));
      await start(page);
      await writeAndCorrect(page, FAULTY);
      await expect(page.getByRole("alert")).toHaveText(expected);
      expect(await documentText(page)).toBe(FAULTY);
      await expect(button(page, "Corriger")).toBeEnabled();
    });
  }

  test("critère 14 : une réponse illisible donne un message, sans rien modifier", async ({
    page,
  }) => {
    await enableAssistant(page);
    await fakeProvider(page, "anthropic", () => ({ raw: "   " }));
    await start(page);
    await writeAndCorrect(page, FAULTY);
    await expect(page.getByRole("alert")).toHaveText(/réponse de l'assistant est illisible/);
    expect(await documentText(page)).toBe(FAULTY);
  });

  test("critère 14 : hors ligne pendant la demande, le message le dit", async ({ page }) => {
    await enableAssistant(page);
    await page.route("https://api.anthropic.com/**", (route) =>
      route.abort("internetdisconnected"),
    );
    await start(page);
    await writeAndCorrect(page, FAULTY);
    await expect(page.getByRole("alert")).toHaveText(/Pas de connexion à internet/);
  });

  test("critère 5 : une demande en cours grise les boutons et s'annule avec Échap", async ({
    page,
  }) => {
    await enableAssistant(page);
    await fakeProvider(page, "anthropic", () => ({ hang: true }));
    await start(page);
    await writeAndCorrect(page, FAULTY);
    await expect(
      page.getByRole("status").filter({ hasText: "Correction en cours…" }),
    ).toBeVisible();
    await expect(button(page, "Corriger")).toBeDisabled();
    await expect(button(page, "Traduire en anglais")).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("status").filter({ hasText: "Demande annulée" })).toBeVisible();
    await expect(button(page, "Corriger")).toBeEnabled();
    expect(await documentText(page)).toBe(FAULTY);
  });

  test("critère 4 : éteindre l'assistant pendant une demande l'abandonne sans message", async ({
    page,
  }) => {
    await enableAssistant(page);
    await fakeProvider(page, "anthropic", () => ({ hang: true }));
    await start(page);
    await writeAndCorrect(page, FAULTY);
    await expect(
      page.getByRole("status").filter({ hasText: "Correction en cours…" }),
    ).toBeVisible();
    await button(page, "Réglages").click();
    const dialog = page.getByRole("dialog", { name: "Réglages" });
    // Échap ferme la boîte, sans annuler la demande en arrière-plan.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: "Correction en cours…" }),
    ).toBeVisible();
    await button(page, "Réglages").click();
    await dialog.getByRole("switch").uncheck();
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(assistantGroup(page)).toHaveCount(0);
    await button(page, "Réglages").click();
    await dialog.getByRole("switch").check();
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(assistantGroup(page)).toBeVisible();
    await expect(page.getByText("Demande annulée")).toHaveCount(0);
    await expect(page.getByText("Correction en cours…")).toHaveCount(0);
    expect(await documentText(page)).toBe(FAULTY);
  });

  test("critère 15 : une sélection de plus de 5 000 mots est refusée, sans requête", async ({
    page,
  }) => {
    await enableAssistant(page);
    const calls = await fakeProvider(page, "anthropic", (paragraphs) => ({ paragraphs }));
    await start(page);
    const long = "mot ".repeat(5001).trim();
    await page.evaluate((text) => {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      document
        .querySelector(".nano-editor")
        ?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
    }, long);
    await page.keyboard.press("ControlOrMeta+A");
    await button(page, "Corriger").click();
    await expect(page.getByRole("alert")).toHaveText(/compte 5\s001 mots/);
    expect(calls).toEqual([]);
  });
});
