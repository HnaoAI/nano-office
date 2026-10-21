// Tests de la logique de l'assistant (src/core/assistant.ts, T3.1) : demande envoyée, lecture de la
// réponse, propositions au mot ou au paragraphe entier, messages d'erreur.
import { describe, expect, it } from "vitest";
import {
  buildRequest,
  cleanParagraph,
  correctionChanges,
  DEFAULT_ASSISTANT_SETTINGS,
  failureMessage,
  parseParagraphs,
} from "../../src/core/assistant";

describe("T3.1 : demande et réponse de l'assistant", () => {
  it("critère 4 : l'assistant est éteint par défaut", () => {
    expect(DEFAULT_ASSISTANT_SETTINGS.enabled).toBe(false);
  });

  it("critère 6 : la demande de correction envoie les paragraphes, avec la consigne en français", () => {
    const request = buildRequest("correct", ["Premier paragrafe.", "Second 😀"]);
    expect(JSON.parse(request.user)).toEqual({ paragraphs: ["Premier paragrafe.", "Second 😀"] });
    expect(request.system).toContain("orthographe, la grammaire");
    expect(request.system).toContain("Ne change ni le sens ni le style");
    expect(request.system).toContain("exactement autant de paragraphes");
    expect(request.schema).toMatchObject({ required: ["paragraphs"] });
  });

  it("critère 13 : la demande ne contient que le texte sélectionné", () => {
    const request = buildRequest("translate", ["Bonjour"]);
    expect(Object.keys(JSON.parse(request.user))).toEqual(["paragraphs"]);
    expect(request.system).toContain("anglais");
  });

  it("critère 6 : une réponse au format demandé donne ses paragraphes, alignés", () => {
    expect(parseParagraphs('{"paragraphs":["Un.","Deux."]}', 2)).toEqual({
      paragraphs: ["Un.", "Deux."],
      aligned: true,
    });
  });

  it("critère 11 : une réponse qui n'a pas le même nombre de paragraphes n'est pas alignée", () => {
    expect(parseParagraphs('{"paragraphs":["Un et deux."]}', 2)?.aligned).toBe(false);
  });

  it("critère 11 : une réponse en texte libre est lue ligne par ligne, sans être alignée", () => {
    expect(parseParagraphs("Un.\n\nDeux.", 2)).toEqual({
      paragraphs: ["Un.", "Deux."],
      aligned: false,
    });
  });

  it("critère 14 : une réponse sans texte est illisible", () => {
    expect(parseParagraphs("   ", 1)).toBeNull();
    expect(parseParagraphs("", 1)).toBeNull();
  });

  it("critère 16 : le texte reçu perd ses retours à la ligne et ses caractères de contrôle", () => {
    expect(cleanParagraph("a\nb\tc\u0000d")).toBe("a b cd");
    // Une balise reste du texte : elle est insérée telle quelle, jamais interprétée.
    expect(cleanParagraph("<script>alert(1)</script>")).toBe("<script>alert(1)</script>");
  });

  it("critère 7 : avec une réponse alignée, chaque paragraphe est comparé au mot", () => {
    const changes = correctionChanges([{ text: "Il et parti." }, { text: "Juste." }], {
      paragraphs: ["Il est parti.", "Juste."],
      aligned: true,
    });
    expect(changes).toEqual([{ paragraph: 0, from: 3, to: 5, removed: "et", insert: "est" }]);
  });

  it("critère 11 : repli au paragraphe : chaque paragraphe est proposé en entier", () => {
    const sent = [{ text: "Un paragrafe." }, { text: "Deux paragrafes." }];
    const changes = correctionChanges(sent, {
      paragraphs: ["Un paragraphe.", "Deux paragraphes.", "En trop."],
      aligned: false,
    });
    expect(changes).toEqual([
      { paragraph: 0, from: 0, to: 13, removed: "Un paragrafe.", insert: "Un paragraphe." },
      {
        paragraph: 1,
        from: 0,
        to: 16,
        removed: "Deux paragrafes.",
        insert: "Deux paragraphes. En trop.",
      },
    ]);
  });

  it("critère 11 : repli au paragraphe : un paragraphe sans réponse reste tel quel", () => {
    const changes = correctionChanges([{ text: "Un." }, { text: "Deux." }], {
      paragraphs: ["Un !"],
      aligned: false,
    });
    expect(changes.map((change) => change.paragraph)).toEqual([0]);
  });

  it("critère 14 : chaque échec a un message clair en français", () => {
    expect(failureMessage("auth", { provider: "anthropic" })).toContain("refusée par Anthropic");
    expect(failureMessage("quota")).toContain("quota");
    expect(failureMessage("offline")).toContain("Pas de connexion");
    expect(failureMessage("timeout")).toContain("30 secondes");
    expect(failureMessage("unreadable")).toContain("illisible");
    expect(failureMessage("model", { model: "gemini-x" })).toContain("« gemini-x »");
  });

  it("critère 15 : le message d'une sélection trop longue donne le nombre de mots", () => {
    // Les milliers sont séparés par une espace fine insécable, à la française.
    expect(failureMessage("too-long", { words: 6200 }).replace(/\u202f/g, " ")).toBe(
      "La sélection compte 6 200 mots : l'assistant en accepte 5 000 au plus, pour éviter une facture surprise.",
    );
  });
});
