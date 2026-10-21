// Majuscules et minuscules (T2.4) : conversion selon les règles du français, en code pur.
import { describe, expect, it } from "vitest";
import { CASE_MODES, convertCase, type CaseMode } from "../../src/core/textCase";

const all = (text: string, mode: CaseMode) => convertCase(text, 0, text.length, mode);

describe("T2.4 : majuscules et minuscules", () => {
  it("critère 1 : quatre choix, dans l'ordre", () => {
    expect(CASE_MODES.map((entry) => entry.label)).toEqual([
      "MAJUSCULES",
      "minuscules",
      "Première lettre de la phrase",
      "Première Lettre De Chaque Mot",
    ]);
  });

  it("critère 3 : é donne É, ç donne Ç, œ donne Œ, et l'inverse", () => {
    expect(all("élève ça cœur à", "upper")).toBe("ÉLÈVE ÇA CŒUR À");
    expect(all("ÉLÈVE ÇA CŒUR À", "lower")).toBe("élève ça cœur à");
  });

  it("critère 3 : chiffres, ponctuation et emojis ne changent pas", () => {
    const text = "12 € ! 😀 👨‍👩‍👧 🇫🇷 (ok) ; « oui »";
    expect(all(text, "upper")).toBe("12 € ! 😀 👨‍👩‍👧 🇫🇷 (OK) ; « OUI »");
    expect(all(text, "lower")).toBe(text);
  });

  it("critère 6 : Première lettre de la phrase, après . ! ? et au début du paragraphe", () => {
    expect(all("BONJOUR. ÇA VA ? OUI ! TRÈS BIEN", "sentence")).toBe(
      "Bonjour. Ça va ? Oui ! Très bien",
    );
    expect(all("« vraiment ? » oui", "sentence")).toBe("« Vraiment ? » Oui");
  });

  it("critère 6 : un point sans espace (nombre, adresse) ne commence pas une phrase", () => {
    expect(all("IL PÈSE 3.5 KG. VOIR WWW.SITE.FR", "sentence")).toBe(
      "Il pèse 3.5 kg. Voir www.site.fr",
    );
  });

  it("Première Lettre De Chaque Mot, avec traits d'union et apostrophes", () => {
    expect(all("JEAN-PIERRE VA À L'ÉCOLE AUJOURD’HUI", "title")).toBe(
      "Jean-Pierre Va À L'école Aujourd’hui",
    );
  });

  it("une partie du paragraphe se convertit selon le texte qui la précède", () => {
    const text = "Il dit. BONJOUR TOUT LE MONDE";
    const start = text.indexOf("BONJOUR");
    expect(convertCase(text, start, text.length, "sentence")).toBe("Bonjour tout le monde");
    const middle = text.indexOf("OUT");
    expect(convertCase(text, middle, middle + 3, "title")).toBe("out");
  });

  it("cas limites : texte vide, accents combinés, ß, texte très long", () => {
    expect(all("", "upper")).toBe("");
    expect(all("été", "upper")).toBe("ÉTÉ");
    expect(all("straße", "upper")).toBe("STRASSE");
    const long = "abc. ".repeat(20000);
    expect(all(long, "sentence")).toBe("Abc. ".repeat(20000));
  });
});
