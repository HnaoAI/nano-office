// Tests du numéro de version affiché sous le nom de l'application (src/core/appVersion.ts), ticket H1,
// critères 10 et 11.
import { describe, expect, it } from "vitest";
import { DEV_VERSION, formatVersion } from "../../src/core/appVersion";

describe("formatVersion (H1)", () => {
  it("critère 10 : format v<date de construction>·<commit court>", () => {
    expect(
      formatVersion(new Date("2026-10-19T14:03:00Z"), "a16f19a3c0d4e5f60718293a4b5c6d7e8f901234"),
    ).toBe("v2026.10.19·a16f19a");
  });

  it("critère 10 : mois et jour sur deux chiffres", () => {
    expect(formatVersion(new Date("2027-01-05T08:00:00Z"), "0123456789")).toBe(
      "v2027.01.05·0123456",
    );
  });

  it("critère 10 : la date est celle du temps universel, identique sur toutes les machines de construction", () => {
    expect(formatVersion(new Date("2026-10-19T23:59:59Z"), "abcdef1")).toBe("v2026.10.19·abcdef1");
    expect(formatVersion(new Date("2026-10-20T00:00:00Z"), "abcdef1")).toBe("v2026.10.20·abcdef1");
  });

  it("critère 10 : un commit en majuscules ou entouré d'espaces est normalisé", () => {
    expect(formatVersion(new Date("2026-10-19T12:00:00Z"), "  A16F19A3C0\n")).toBe(
      "v2026.10.19·a16f19a",
    );
  });

  it("critère 10 : un commit inconnu (Git absent) ne casse pas la construction", () => {
    expect(formatVersion(new Date("2026-10-19T12:00:00Z"), "")).toBe("v2026.10.19·inconnu");
  });

  it("critère 11 : la version de développement s'écrit « dev »", () => {
    expect(DEV_VERSION).toBe("dev");
  });
});
