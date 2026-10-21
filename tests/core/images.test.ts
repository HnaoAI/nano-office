// Tests des règles des images (src/core/images.ts), ticket T1.9 : format reconnu, empreinte,
// réduction, rangement une seule fois, texte de remplacement par défaut.
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  defaultAltText,
  detectImageType,
  imageHash,
  imageRefs,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_SIDE,
  planImageEncoding,
  readImage,
  storeImage,
} from "../../src/core/images";
import { fakePng, illustratedDocument, imageNode } from "./imageHelpers";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("detectImageType", () => {
  it("critère 1 : reconnaît JPEG, PNG, WebP et GIF à leurs premiers octets", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectImageType(fakePng(1).data)).toBe("image/png");
    expect(detectImageType(new TextEncoder().encode("GIF89a..."))).toBe("image/gif");
    expect(detectImageType(new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe(
      "image/webp",
    );
  });

  it("critère 1 : refuse un autre format, un fichier vide ou trop court", () => {
    expect(detectImageType(new TextEncoder().encode("BM...."))).toBeNull();
    expect(
      detectImageType(new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WAVE")),
    ).toBeNull();
    expect(detectImageType(new TextEncoder().encode("<svg></svg>"))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
    expect(detectImageType(bytes(0xff, 0xd8))).toBeNull();
  });
});

describe("imageHash", () => {
  it("critère 6 : empreinte SHA-256 en hexadécimal", () => {
    expect(imageHash(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(imageHash(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("critère 6 : deux contenus identiques ont la même empreinte, deux contenus différents non", () => {
    expect(imageHash(fakePng(1).data)).toBe(imageHash(fakePng(1).data));
    expect(imageHash(fakePng(1).data)).not.toBe(imageHash(fakePng(2).data));
  });
});

describe("planImageEncoding", () => {
  it("critère 2 : une image de plus de 2 000 px sur son grand côté est réduite à 2 000 px, proportions gardées", () => {
    expect(
      planImageEncoding({ type: "image/jpeg", width: 4032, height: 3024, transparent: false }),
    ).toEqual({ width: 2000, height: 1500, reencode: true, type: "image/jpeg" });
    expect(
      planImageEncoding({ type: "image/jpeg", width: 3024, height: 4032, transparent: false }),
    ).toEqual({ width: 1500, height: 2000, reencode: true, type: "image/jpeg" });
  });

  it("critère 2 : une grande photo est réencodée en JPEG, même si elle était en PNG ou WebP", () => {
    for (const type of ["image/png", "image/webp"] as const) {
      expect(planImageEncoding({ type, width: 3000, height: 2000, transparent: false }).type).toBe(
        "image/jpeg",
      );
    }
  });

  it("critère 2 : une grande image avec transparence reste en PNG", () => {
    expect(
      planImageEncoding({ type: "image/png", width: 2400, height: 800, transparent: true }),
    ).toEqual({ width: 2000, height: 667, reencode: true, type: "image/png" });
  });

  it("critère 2 : une image déjà petite n'est pas réencodée, même à 2 000 px tout juste", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"] as const) {
      expect(planImageEncoding({ type, width: 2000, height: 1200, transparent: true })).toEqual({
        width: 2000,
        height: 1200,
        reencode: false,
        type,
      });
    }
  });

  it("critère 1 : un GIF ne garde que sa première image, en PNG, même petit", () => {
    expect(
      planImageEncoding({ type: "image/gif", width: 120, height: 80, transparent: false }),
    ).toEqual({ width: 120, height: 80, reencode: true, type: "image/png" });
  });

  it("une image très étroite garde au moins 1 pixel de côté", () => {
    const plan = planImageEncoding({
      type: "image/png",
      width: 10000,
      height: 1,
      transparent: false,
    });
    expect(plan.width).toBe(MAX_IMAGE_SIDE);
    expect(plan.height).toBe(1);
  });

  it("critère 2 : la limite de taille d'un fichier est de 25 Mo", () => {
    expect(MAX_IMAGE_BYTES).toBe(25 * 1024 * 1024);
  });
});

describe("storeImage", () => {
  it("critère 6 : une image insérée deux fois n'est rangée qu'une fois", () => {
    const ydoc = new Y.Doc();
    const updates: Uint8Array[] = [];
    ydoc.on("update", (update: Uint8Array) => updates.push(update));
    const first = storeImage(ydoc, fakePng(1));
    const second = storeImage(ydoc, fakePng(1));
    expect(second).toBe(first);
    expect(updates).toHaveLength(1);
    expect(ydoc.getMap("images").size).toBe(1);
    expect(readImage(ydoc, first)?.data).toEqual(fakePng(1).data);
  });

  it("critère 9 : une empreinte inconnue ou une entrée abîmée se lit comme une image manquante", () => {
    const ydoc = new Y.Doc();
    expect(readImage(ydoc, "0".repeat(64))).toBeNull();
    ydoc.getMap("images").set("a".repeat(64), { type: "image/bmp", data: new Uint8Array(3) });
    ydoc.getMap("images").set("b".repeat(64), { type: "image/png", data: "pas des octets" });
    ydoc.getMap("images").set("c".repeat(64), "texte");
    expect(readImage(ydoc, "a".repeat(64))).toBeNull();
    expect(readImage(ydoc, "b".repeat(64))).toBeNull();
    expect(readImage(ydoc, "c".repeat(64))).toBeNull();
  });
});

describe("imageRefs", () => {
  it("critère 6 : liste chaque image du document une seule fois", () => {
    const a = imageHash(fakePng(1).data);
    const b = imageHash(fakePng(2).data);
    const json = {
      type: "doc",
      content: [imageNode("i-1", a), imageNode("i-2", b), imageNode("i-3", a)],
    };
    expect(imageRefs(json)).toEqual([a, b]);
  });

  it("ignore une image sans empreinte valide, et un document sans image", () => {
    expect(imageRefs({ type: "doc", content: [imageNode("i-1", "pas-une-empreinte")] })).toEqual(
      [],
    );
    expect(imageRefs({ type: "doc" })).toEqual([]);
    expect(imageRefs(illustratedDocument("A".repeat(64)))).toEqual([]);
  });
});

describe("defaultAltText", () => {
  it("critère 5 : par défaut, le nom du fichier sans extension", () => {
    expect(defaultAltText("Vacances à l'île 🏝️.jpeg")).toBe("Vacances à l'île 🏝️");
    expect(defaultAltText("logo.png")).toBe("logo");
    expect(defaultAltText("archive.tar.gz")).toBe("archive.tar");
    expect(defaultAltText("C:\\Photos\\été.jpg")).toBe("été");
  });

  it("critère 5 : une image collée sans nom n'a pas de texte de remplacement", () => {
    expect(defaultAltText(null)).toBe("");
    expect(defaultAltText("")).toBe("");
    expect(defaultAltText(".png")).toBe(".png");
  });
});
