// Tests des appels aux fournisseurs (src/assistant/, T3.1, critères 13 et 14), avec un faux `fetch` :
// adresses, en-têtes, contenu envoyé, réponses et erreurs de Claude et de Gemini, délai dépassé, Échap.
import { describe, expect, it } from "vitest";
import { buildRequest } from "../../src/core/assistant";
import { AssistantFailure } from "../../src/assistant/failure";
import { createProvider, sendWithTimeout } from "../../src/assistant/provider";

interface Call {
  url: string;
  init: RequestInit;
}

/** Seul appel reçu par le faux `fetch`. */
function onlyCall(calls: Call[]): Call {
  expect(calls).toHaveLength(1);
  const [call] = calls;
  if (!call) throw new Error("aucun appel");
  return call;
}

/** Faux `fetch` qui répond toujours `response`, et note les appels. */
function fakeFetch(response: () => Response) {
  const calls: Call[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return response();
  }) as typeof fetch;
  return { calls, fetcher };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const REQUEST = buildRequest("correct", ["Le chat dor."]);

async function failureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AssistantFailure) return error.kind;
    throw error;
  }
  throw new Error("aucun échec");
}

describe("T3.1 : Claude (Anthropic)", () => {
  it("critère 13 : appelle api.anthropic.com avec l'en-tête prévu pour le navigateur", async () => {
    const { calls, fetcher } = fakeFetch(() =>
      json({
        content: [{ type: "text", text: '{"paragraphs":["Le chat dort."]}' }],
        stop_reason: "end_turn",
      }),
    );
    const provider = createProvider({
      provider: "anthropic",
      model: "claude-haiku-5-5",
      apiKey: "sk-1",
      fetch: fetcher,
    });
    const text = await sendWithTimeout(provider, REQUEST, new AbortController().signal);
    expect(text).toBe('{"paragraphs":["Le chat dort."]}');
    const call = onlyCall(calls);
    expect(call.url).toBe("https://api.anthropic.com/v1/messages");
    const headers = call.init.headers as Record<string, string>;
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(headers["x-api-key"]).toBe("sk-1");
    const body = JSON.parse(String(call.init.body));
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.messages).toEqual([{ role: "user", content: REQUEST.user }]);
    expect(body.output_config.format).toEqual({ type: "json_schema", schema: REQUEST.schema });
  });

  it("critère 14 : clé refusée, quota, service surchargé, modèle inconnu", async () => {
    const cases: [number, string][] = [
      [401, "auth"],
      [403, "auth"],
      [429, "quota"],
      [529, "busy"],
      [404, "model"],
      [400, "failed"],
    ];
    for (const [status, kind] of cases) {
      const { fetcher } = fakeFetch(() => json({ type: "error" }, status));
      const provider = createProvider({
        provider: "anthropic",
        model: "m",
        apiKey: "k",
        fetch: fetcher,
      });
      expect(
        await failureOf(sendWithTimeout(provider, REQUEST, new AbortController().signal)),
      ).toBe(kind);
    }
  });

  it("critère 14 : un crédit Anthropic épuisé (400 « credit balance ») est un quota atteint", async () => {
    const { fetcher } = fakeFetch(() =>
      json(
        {
          type: "error",
          error: {
            type: "invalid_request_error",
            message: "Your credit balance is too low to access the Anthropic API.",
          },
        },
        400,
      ),
    );
    const provider = createProvider({
      provider: "anthropic",
      model: "m",
      apiKey: "k",
      fetch: fetcher,
    });
    expect(await failureOf(sendWithTimeout(provider, REQUEST, new AbortController().signal))).toBe(
      "quota",
    );
  });

  it("critère 14 : une réponse sans texte, coupée ou refusée n'est pas lue", async () => {
    const bodies: [unknown, string][] = [
      [{ content: [], stop_reason: "end_turn" }, "unreadable"],
      [{ content: [{ type: "text", text: '{"par' }], stop_reason: "max_tokens" }, "unreadable"],
      [{ content: [], stop_reason: "refusal" }, "refused"],
    ];
    for (const [body, kind] of bodies) {
      const { fetcher } = fakeFetch(() => json(body));
      const provider = createProvider({
        provider: "anthropic",
        model: "m",
        apiKey: "k",
        fetch: fetcher,
      });
      expect(
        await failureOf(sendWithTimeout(provider, REQUEST, new AbortController().signal)),
      ).toBe(kind);
    }
  });
});

describe("T3.1 : Gemini (Google)", () => {
  it("critère 13 : appelle generativelanguage.googleapis.com, la clé dans l'en-tête seulement", async () => {
    const { calls, fetcher } = fakeFetch(() =>
      json({
        candidates: [
          {
            content: { parts: [{ text: '{"paragraphs":["Le chat dort."]}' }] },
            finishReason: "STOP",
          },
        ],
      }),
    );
    const provider = createProvider({
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      apiKey: "AIza-1",
      fetch: fetcher,
    });
    const text = await sendWithTimeout(provider, REQUEST, new AbortController().signal);
    expect(text).toBe('{"paragraphs":["Le chat dort."]}');
    const call = onlyCall(calls);
    expect(call.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    );
    expect(call.url).not.toContain("AIza-1");
    expect((call.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("AIza-1");
    const body = JSON.parse(String(call.init.body));
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: REQUEST.user }] }]);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("critère 14 : une clé invalide (400 API_KEY_INVALID) est une clé refusée", async () => {
    const { fetcher } = fakeFetch(() =>
      json({ error: { code: 400, details: [{ reason: "API_KEY_INVALID" }] } }, 400),
    );
    const provider = createProvider({
      provider: "gemini",
      model: "m",
      apiKey: "k",
      fetch: fetcher,
    });
    expect(await failureOf(sendWithTimeout(provider, REQUEST, new AbortController().signal))).toBe(
      "auth",
    );
  });

  it("critère 14 : quota, texte bloqué, réponse coupée", async () => {
    const cases: [() => Response, string][] = [
      [() => json({ error: {} }, 429), "quota"],
      [() => json({ error: {} }, 503), "busy"],
      [() => json({ promptFeedback: { blockReason: "SAFETY" } }), "refused"],
      [
        () =>
          json({
            candidates: [{ content: { parts: [{ text: "{" }] }, finishReason: "MAX_TOKENS" }],
          }),
        "unreadable",
      ],
    ];
    for (const [response, kind] of cases) {
      const { fetcher } = fakeFetch(response);
      const provider = createProvider({
        provider: "gemini",
        model: "m",
        apiKey: "k",
        fetch: fetcher,
      });
      expect(
        await failureOf(sendWithTimeout(provider, REQUEST, new AbortController().signal)),
      ).toBe(kind);
    }
  });
});

describe("T3.1 : délai, annulation et réseau", () => {
  /** Faux `fetch` qui ne répond jamais, mais s'arrête quand la demande est annulée. */
  const hanging = (async (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("abandon", "AbortError")),
      );
    })) as typeof fetch;

  it("critère 14 : une demande sans réponse est abandonnée après le délai", async () => {
    const provider = createProvider({
      provider: "anthropic",
      model: "m",
      apiKey: "k",
      fetch: hanging,
    });
    expect(
      await failureOf(sendWithTimeout(provider, REQUEST, new AbortController().signal, 20)),
    ).toBe("timeout");
  });

  it("critère 5 : Échap annule la demande en cours", async () => {
    const provider = createProvider({
      provider: "gemini",
      model: "m",
      apiKey: "k",
      fetch: hanging,
    });
    const controller = new AbortController();
    const pending = sendWithTimeout(provider, REQUEST, controller.signal);
    controller.abort();
    expect(await failureOf(pending)).toBe("cancelled");
  });

  it("critère 14 : sans réseau, le message dit que l'assistant n'est pas joignable", async () => {
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const provider = createProvider({
      provider: "anthropic",
      model: "m",
      apiKey: "k",
      fetch: offline,
    });
    expect(await failureOf(sendWithTimeout(provider, REQUEST, new AbortController().signal))).toBe(
      "offline",
    );
  });
});
