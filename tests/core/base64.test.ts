// Tests de la conversion base64 (src/core/base64.ts).
import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64 } from "../../src/core/base64";

describe("base64", () => {
  it("fait l'aller-retour sur des octets vides", () => {
    expect(base64ToBytes(bytesToBase64(new Uint8Array()))).toEqual(new Uint8Array());
  });

  it("fait l'aller-retour sur toutes les valeurs d'octet et un gros tableau", () => {
    const bytes = new Uint8Array(300_000).map((_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("lève une erreur sur une chaîne qui n'est pas du base64", () => {
    expect(() => base64ToBytes("pas du base64 !")).toThrow();
  });
});
