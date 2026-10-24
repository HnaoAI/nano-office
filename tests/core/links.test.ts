// Liens (T2.12) : adresses acceptées et refusées, adresse tapée complétée, texte affiché.
import { describe, expect, it } from "vitest";
import { isAllowedLinkUrl, linkLabel, normalizeLinkInput } from "../../src/core/links";

describe("T2.12 : adresses des liens", () => {
  it("critère 1 : une adresse sans https:// le reçoit d'elle-même", () => {
    expect(normalizeLinkInput("exemple.fr")).toBe("https://exemple.fr");
    expect(normalizeLinkInput("  www.école.fr/page?x=1#haut  ")).toBe(
      "https://www.école.fr/page?x=1#haut",
    );
    expect(normalizeLinkInput("http://exemple.fr")).toBe("http://exemple.fr");
    expect(normalizeLinkInput("https://exemple.fr/a b")).toBeNull();
  });

  it("critère 1 : une adresse e-mail devient mailto:", () => {
    expect(normalizeLinkInput("mamie@exemple.fr")).toBe("mailto:mamie@exemple.fr");
    expect(normalizeLinkInput("mailto:papi@exemple.fr")).toBe("mailto:papi@exemple.fr");
    expect(linkLabel("mailto:mamie@exemple.fr")).toBe("mamie@exemple.fr");
    expect(linkLabel("https://exemple.fr")).toBe("https://exemple.fr");
  });

  it("critère 2 : seules les adresses http, https et mailto sont acceptées", () => {
    for (const refused of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "java\nscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "ftp://exemple.fr",
      "tel:0102030405",
      "vbscript:msgbox",
      "",
      "   ",
      "bonjour",
      "mailto:pas-une-adresse",
    ]) {
      expect(normalizeLinkInput(refused), refused).toBeNull();
      expect(isAllowedLinkUrl(refused), refused).toBe(false);
    }
    expect(isAllowedLinkUrl("https://exemple.fr")).toBe(true);
    expect(isAllowedLinkUrl("mailto:a@b.fr")).toBe(true);
    expect(isAllowedLinkUrl(null)).toBe(false);
    expect(isAllowedLinkUrl("https://")).toBe(false);
  });

  it("critère 1 : une adresse très longue, accentuée ou avec un emoji reste acceptée", () => {
    const long = `https://exemple.fr/${"a".repeat(5000)}`;
    expect(normalizeLinkInput(long)).toBe(long);
    expect(normalizeLinkInput("exemple.fr/vacances-🏖️")).toBe("https://exemple.fr/vacances-🏖️");
  });

  it("critère 2 : une adresse mailto mal encodée est refusée, sans plantage", () => {
    expect(() => isAllowedLinkUrl("mailto:caf%E9@exemple.fr")).not.toThrow();
    expect(isAllowedLinkUrl("mailto:caf%E9@exemple.fr")).toBe(false);
    expect(normalizeLinkInput("mailto:caf%E9@exemple.fr")).toBeNull();
  });

  it("critère 1 : un protocole tapé en majuscules est mis en minuscules", () => {
    expect(normalizeLinkInput("MAILTO:Foo@bar.fr")).toBe("mailto:Foo@bar.fr");
    expect(normalizeLinkInput("HTTPS://exemple.fr")).toBe("https://exemple.fr");
  });
});
