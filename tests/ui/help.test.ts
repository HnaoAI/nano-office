// @vitest-environment jsdom
// Tests du contenu de l'aide intégrée (A1) : sommaire et ordre des sections, phrases des messages reprises
// des constantes de l'application, langue simple au vouvoiement, raccourcis tirés des raccourcis réels.
import { describe, expect, it } from "vitest";
import { CORRUPTED_FILE_MESSAGE, PARSE_ERROR_MESSAGES } from "../../src/core/documentFile";
import { formatShortcuts, matchesShortcut } from "../../src/editor/keyboardShortcuts";
import { recoveredMessage, saveMessage } from "../../src/ui/fileMessages";
import { HELP_MESSAGES, HELP_SECTIONS, type HelpBlock } from "../../src/ui/help/helpContent";
import {
  helpShortcutGroups,
  shortcutKeys,
  type HelpShortcut,
} from "../../src/ui/help/helpShortcuts";
import { isHelpShortcut } from "../../src/ui/help/useHelpPanel";
import { UPDATE_REASSURANCE, UPDATE_TITLE } from "../../src/ui/updateTexts";

/** Tout le texte d'une section, pour les vérifications de langue. */
function texts(block: HelpBlock): string[] {
  switch (block.kind) {
    case "text":
      return [block.text];
    case "steps":
      return [...(block.title ? [block.title] : []), ...block.items];
    case "message":
      return [block.title, block.todo];
    case "shortcuts":
      return [];
  }
}

function section(id: string) {
  const found = HELP_SECTIONS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`section absente : ${id}`);
  return found;
}

function sectionText(id: string): string {
  return section(id).blocks.flatMap(texts).join(" ");
}

const ALL_TEXT = HELP_SECTIONS.flatMap((section) => [
  section.title,
  ...section.blocks.flatMap(texts),
]);

describe("sommaire (A1, critère 3)", () => {
  it("critère 3 : une section par sujet, dans l'ordre du ticket", () => {
    expect(HELP_SECTIONS.map((section) => section.title)).toEqual([
      "Installer Nano Buro",
      "Où ranger ses documents",
      "Ne rien perdre",
      "Les messages et quoi faire",
      "Mettre en forme",
      "Imprimer, PDF et Word",
      "Raccourcis clavier",
      "Mises à jour",
      "Confidentialité",
    ]);
  });

  it("critère 3 : chaque section a un identifiant unique pour le sommaire et un contenu", () => {
    const ids = HELP_SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of HELP_SECTIONS) expect(section.blocks.length).toBeGreaterThan(0);
  });

  it("critère 3.1 : l'installation explique le Mac avec Chrome et le PC avec Edge", () => {
    const install = sectionText("install");
    expect(install).toContain("Sur le Mac, avec Chrome");
    expect(install).toContain("Sur le PC, avec Edge");
    expect(install).toContain("barre d'adresse");
  });

  it("critère 3.2 : ranger ses documents cite les trois dossiers synchronisés, « Enregistrer sous… » et l'enregistrement automatique", () => {
    const folders = sectionText("folders");
    for (const word of [
      "OneDrive",
      "Dropbox",
      "Google Drive",
      "« Enregistrer sous… »",
      "tout seul",
    ]) {
      expect(folders).toContain(word);
    }
  });

  it("critère 3.6 : imprimer rappelle la case « En-têtes et pieds de page » à décocher", () => {
    const print = sectionText("print");
    expect(print).toContain("décochez la case « En-têtes et pieds de page »");
    expect(print).toContain("Word");
    expect(print).toContain("PDF");
  });

  it("critère 3.8 : les mises à jour citent la fenêtre « se met à jour » de H3, avec ses phrases", () => {
    const updates = sectionText("updates");
    expect(updates).toContain(UPDATE_TITLE);
    expect(updates).toContain(UPDATE_REASSURANCE);
    expect(updates).toContain("numéro de version");
  });

  it("critère 3.9 : la confidentialité dit que rien n'est envoyé, et présente l'assistant facultatif (lot G fait)", () => {
    const privacy = sectionText("privacy");
    expect(privacy).toContain("n'envoie rien sur Internet");
    expect(privacy).toContain("L'assistant IA est facultatif");
  });
});

describe("messages cités (A1, critère 4)", () => {
  it("critère 4 : les phrases des messages viennent des mêmes constantes que l'application", () => {
    expect(HELP_MESSAGES.recovered).toBe(recoveredMessage(null).text);
    expect(HELP_MESSAGES.changedElsewhere).toBe(
      saveMessage({ status: "conflict", name: "Lettre.nano" })?.text,
    );
    expect(HELP_MESSAGES.permission).toBe(
      recoveredMessage({ name: "Lettre.nano", needsPermission: true, changedElsewhere: false })
        .text,
    );
    expect(HELP_MESSAGES.corrupted).toBe(CORRUPTED_FILE_MESSAGE);
    expect(HELP_MESSAGES.newerVersion).toBe(PARSE_ERROR_MESSAGES["unsupported-version"]);
    expect(HELP_MESSAGES.saveFailed).toBe(saveMessage({ status: "failed" })?.text);
  });

  it("critère 3.4 : la section des messages cite chacun d'eux, dans l'ordre du ticket, avec « que faire »", () => {
    const messages = section("messages").blocks.filter((block) => block.kind === "message");
    expect(messages.map((block) => block.shown)).toEqual([
      HELP_MESSAGES.recovered,
      HELP_MESSAGES.changedElsewhere,
      HELP_MESSAGES.permission,
      HELP_MESSAGES.corrupted,
      HELP_MESSAGES.newerVersion,
      HELP_MESSAGES.saveFailed,
    ]);
    for (const block of messages) {
      expect(block.shown).not.toBe("");
      expect(block.todo.length).toBeGreaterThan(20);
    }
  });
});

describe("langue (A1, critère 5)", () => {
  it("critère 5 : sans jargon technique", () => {
    const joined = ALL_TEXT.join(" ");
    for (const word of ["PWA", "Yjs", "IndexedDB", "service worker", "API", "JSON", "cache"]) {
      expect(joined).not.toContain(word);
    }
  });

  it("critère 5 : au vouvoiement, jamais au tutoiement", () => {
    const joined = ` ${ALL_TEXT.join(" ")} `.toLowerCase();
    for (const word of [" tu ", " ton ", " ta ", " tes ", " toi ", " t'"]) {
      expect(joined).not.toContain(word);
    }
    expect(joined).toContain("vous");
  });

  it("critère 5 : en phrases courtes (40 mots au plus)", () => {
    for (const text of ALL_TEXT) {
      for (const sentence of text.split(/(?<=[.:!?])\s+/)) {
        expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(40);
      }
    }
  });
});

/** Événement clavier d'un raccourci, sur Mac (Cmd) ou sur PC (Ctrl). */
function keyEvent(shortcut: HelpShortcut, mac: boolean): KeyboardEvent {
  const key = shortcut.code.startsWith("Key")
    ? shortcut.code.slice(3).toLowerCase()
    : shortcut.code === "Slash"
      ? "/"
      : shortcut.code.replace("Digit", "");
  return new KeyboardEvent("keydown", {
    code: shortcut.code,
    key,
    metaKey: mac && Boolean(shortcut.mod),
    ctrlKey: !mac && Boolean(shortcut.mod),
    shiftKey: Boolean(shortcut.shift),
    altKey: Boolean(shortcut.alt),
  });
}

describe("raccourcis (A1, critère 3.7)", () => {
  for (const mac of [true, false]) {
    const computer = mac ? "Mac" : "PC";

    it(`critère 3.7 (${computer}) : tous les raccourcis de mise en forme réels figurent dans l'aide, dans le même ordre`, () => {
      const format = helpShortcutGroups(mac).find((group) => group.title === "Mise en forme");
      const shown = format?.shortcuts.map(({ label, code, mod, shift, alt }) => ({
        label,
        code,
        mod,
        shift,
        alt,
      }));
      const real = formatShortcuts(mac).map(({ label, code, mod, shift, alt }) => ({
        label,
        code,
        mod,
        shift,
        alt,
      }));
      expect(shown?.slice(-real.length)).toEqual(real);
      // Chaque ligne affichée déclenche bien le raccourci réel correspondant.
      for (const shortcut of formatShortcuts(mac)) {
        expect(matchesShortcut(keyEvent(shortcut, mac), shortcut, mac)).toBe(true);
      }
    });

    it(`critère 3.7 (${computer}) : les raccourcis du document affichés sont ceux qu'écoute l'application`, async () => {
      const { isSaveShortcut } = await import("../../src/ui/useSaveShortcut");
      const { isPrintShortcut } = await import("../../src/ui/usePrintShortcut");
      const { searchShortcut } = await import("../../src/ui/useSearchShortcuts");
      const documentGroup = helpShortcutGroups(mac).find((group) => group.title === "Document");
      const byLabel = new Map(
        documentGroup?.shortcuts.map((shortcut) => [shortcut.label, shortcut]),
      );
      const event = (label: string) => {
        const shortcut = byLabel.get(label);
        if (!shortcut) throw new Error(`raccourci absent de l'aide : ${label}`);
        return keyEvent(shortcut, mac);
      };
      expect(isSaveShortcut(event("Enregistrer"))).toBe(true);
      expect(isPrintShortcut(event("Imprimer ou créer un PDF"))).toBe(true);
      expect(searchShortcut(event("Rechercher"), mac)).toBe("find");
      expect(searchShortcut(event("Rechercher et remplacer"), mac)).toBe("replace");
      expect(isHelpShortcut(event("Ouvrir ou fermer l'aide"))).toBe(true);
      expect(byLabel.size).toBe(5);
    });

    it(`critère 3.7 (${computer}) : les touches affichées sont celles de l'ordinateur`, () => {
      const all = helpShortcutGroups(mac).flatMap((group) => group.shortcuts);
      const keys = all.map((shortcut) => shortcutKeys(shortcut, mac));
      if (mac) {
        expect(keys.some((key) => key.includes("Ctrl"))).toBe(false);
        expect(keys).toContain("⌘S");
        expect(keys).toContain("⌥⌘1");
        expect(keys).toContain("⇧⌘X");
        expect(keys).toContain("⌥⌘F");
      } else {
        expect(keys.some((key) => /[⌘⌥⇧]/.test(key))).toBe(false);
        expect(keys).toContain("Ctrl+S");
        expect(keys).toContain("Ctrl+Shift+1");
        expect(keys).toContain("Ctrl+H");
        expect(keys).toContain("Shift+Tab");
      }
    });
  }
});

describe("isHelpShortcut (A1, critère 1)", () => {
  const press = (init: KeyboardEventInit) => isHelpShortcut(new KeyboardEvent("keydown", init));

  it("critère 1 : Ctrl+/ sur PC et Cmd+/ sur Mac ouvrent l'aide", () => {
    expect(press({ code: "Slash", key: "/", ctrlKey: true })).toBe(true);
    expect(press({ code: "Slash", key: "/", metaKey: true })).toBe(true);
  });

  it("critère 1 : sur un clavier AZERTY, Ctrl+/ (Shift+:) ouvre aussi l'aide", () => {
    expect(press({ code: "Period", key: "/", ctrlKey: true, shiftKey: true })).toBe(true);
  });

  it("cas limite : ni / seul, ni avec AltGr (Ctrl+Alt), ni Ctrl+: n'ouvrent l'aide", () => {
    expect(press({ code: "Slash", key: "/" })).toBe(false);
    expect(press({ code: "Slash", key: "/", ctrlKey: true, altKey: true })).toBe(false);
    expect(press({ code: "Period", key: ":", ctrlKey: true })).toBe(false);
  });
});
