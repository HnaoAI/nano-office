// Outils des tests de l'assistant (T3.1) : faux fournisseurs Claude et Gemini sur les vraies adresses
// (`page.route`), journal des requêtes envoyées, réglages posés avant le chargement de la page.
import type { Page, Request, Route } from "@playwright/test";

/** Clés d'API de test, cherchées ensuite dans le fichier enregistré et la copie de secours. */
export const ANTHROPIC_TEST_KEY = "sk-ant-test-CLE-SECRETE-123";
export const GEMINI_TEST_KEY = "AIza-test-CLE-SECRETE-456";

/** Une requête reçue par un faux fournisseur. */
export interface ProviderCall {
  url: string;
  headers: Record<string, string>;
  /** Paragraphes envoyés (champ `paragraphs` du message de l'utilisateur). */
  paragraphs: string[];
  body: string;
}

/** Ce que répond le faux fournisseur : les paragraphes corrigés ou traduits, ou une erreur. */
export type FakeAnswer =
  { paragraphs: string[] } | { raw: string } | { status: number; body?: unknown } | { hang: true };

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "POST, OPTIONS",
};

function paragraphsSent(provider: "anthropic" | "gemini", body: string): string[] {
  const json = JSON.parse(body) as {
    messages?: { content: string }[];
    contents?: { parts: { text: string }[] }[];
  };
  const user =
    provider === "anthropic" ? json.messages?.[0]?.content : json.contents?.[0]?.parts[0]?.text;
  return (JSON.parse(user ?? "{}") as { paragraphs?: string[] }).paragraphs ?? [];
}

function successBody(provider: "anthropic" | "gemini", text: string) {
  return provider === "anthropic"
    ? { content: [{ type: "text", text }], stop_reason: "end_turn" }
    : { candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] };
}

/**
 * Installe un faux fournisseur. `answer` donne la réponse de chaque requête, à partir des paragraphes
 * reçus. Renvoie le journal des requêtes, à lire après coup.
 */
export async function fakeProvider(
  page: Page,
  provider: "anthropic" | "gemini",
  answer: (paragraphs: string[]) => FakeAnswer,
): Promise<ProviderCall[]> {
  const calls: ProviderCall[] = [];
  const pattern =
    provider === "anthropic"
      ? "https://api.anthropic.com/**"
      : "https://generativelanguage.googleapis.com/**";
  await page.route(pattern, async (route: Route, request: Request) => {
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    const body = request.postData() ?? "";
    const paragraphs = paragraphsSent(provider, body);
    calls.push({ url: request.url(), headers: request.headers(), paragraphs, body });
    const result = answer(paragraphs);
    if ("hang" in result) return; // Jamais de réponse : la demande attend son annulation.
    if ("status" in result) {
      await route.fulfill({
        status: result.status,
        headers: CORS_HEADERS,
        contentType: "application/json",
        body: JSON.stringify(result.body ?? { error: { message: "erreur" } }),
      });
      return;
    }
    const text = "raw" in result ? result.raw : JSON.stringify({ paragraphs: result.paragraphs });
    await route.fulfill({
      status: 200,
      headers: CORS_HEADERS,
      contentType: "application/json",
      body: JSON.stringify(successBody(provider, text)),
    });
  });
  return calls;
}

/** Allume l'assistant avant le chargement de la page, comme si les Réglages avaient été enregistrés. */
export async function enableAssistant(page: Page, provider: "anthropic" | "gemini" = "anthropic") {
  await page.addInitScript(
    ([chosen, anthropicKey, geminiKey]) => {
      if (sessionStorage.getItem("__assistantSet")) return;
      sessionStorage.setItem("__assistantSet", "1");
      localStorage.setItem(
        "nano-office:assistant-settings",
        JSON.stringify({
          enabled: true,
          provider: chosen,
          models: { anthropic: "claude-haiku-5-5", gemini: "gemini-3.5-flash-lite" },
        }),
      );
      localStorage.setItem(
        "nano-office:assistant-keys",
        JSON.stringify({ anthropic: anthropicKey, gemini: geminiKey }),
      );
    },
    [provider, ANTHROPIC_TEST_KEY, GEMINI_TEST_KEY] as const,
  );
}

/** Requêtes de la page vers un fournisseur d'IA, d'après le journal du contexte. */
export function providerRequests(page: Page): string[] {
  const seen: string[] = [];
  page.context().on("request", (request) => {
    const host = new URL(request.url()).host;
    if (host === "api.anthropic.com" || host === "generativelanguage.googleapis.com") {
      seen.push(`${request.method()} ${request.url()}`);
    }
  });
  return seen;
}

/** Tout le contenu des bases IndexedDB de la page (copies de secours comprises), en texte. */
export async function indexedDbDump(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const decoder = new TextDecoder();
    const parts: string[] = [];
    for (const { name } of await indexedDB.databases()) {
      if (!name) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      for (const storeName of Array.from(db.objectStoreNames)) {
        const values = await new Promise<unknown[]>((resolve, reject) => {
          const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
          request.onsuccess = () => resolve(request.result as unknown[]);
          request.onerror = () => reject(request.error);
        });
        for (const value of values) {
          parts.push(value instanceof Uint8Array ? decoder.decode(value) : JSON.stringify(value));
        }
      }
      db.close();
    }
    return parts.join("\n");
  });
}
