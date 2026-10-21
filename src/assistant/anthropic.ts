// Claude (Anthropic) : API Messages appelée directement depuis le navigateur, avec la clé de
// l'utilisateur (T3.1). Pas de SDK : celui d'Anthropic dépend d'une bibliothèque sous licence
// Unlicense, hors des licences acceptées. Documentation : https://docs.claude.com/en/api/messages
import type { AssistantRequest } from "../core/assistant";
import { AssistantFailure, failureForStatus, MAX_OUTPUT_TOKENS } from "./failure";
import type { AssistantProvider } from "./provider";

/** Adresse de l'API Messages. */
export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/** Réponse de l'API Messages, réduite à ce qui est lu. */
interface MessagesResponse {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
}

/**
 * Vrai si une réponse 400 dit que le crédit du compte est épuisé : Anthropic ne répond pas 402 ou 429
 * dans ce cas, fréquent avec une clé neuve (critère 14).
 */
async function creditTooLow(response: Response): Promise<boolean> {
  try {
    const body = (await response.clone().json()) as { error?: { message?: unknown } };
    const text = body.error?.message;
    return typeof text === "string" && /credit balance/i.test(text);
  } catch {
    return false;
  }
}

/**
 * Fournisseur Claude.
 * - `anthropic-dangerous-direct-browser-access` est l'en-tête prévu pour un appel depuis le navigateur
 *   avec la clé de l'utilisateur (critère 13).
 * - La réponse est demandée au format JSON du schéma (`output_config.format`), avec un effort faible :
 *   corriger et traduire n'ont pas besoin d'un long raisonnement.
 * - 529 (service surchargé) et les erreurs 5xx deviennent « busy » ; 401 et 403 « auth » ; 429 et
 *   un crédit épuisé (400) « quota ».
 */
export function createAnthropicProvider(
  model: string,
  apiKey: string,
  fetcher: typeof fetch,
): AssistantProvider {
  return {
    id: "anthropic",
    model,
    async send(request: AssistantRequest, signal: AbortSignal) {
      const response = await fetcher(ANTHROPIC_URL, {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: request.system,
          messages: [{ role: "user", content: request.user }],
          output_config: {
            effort: "low",
            format: { type: "json_schema", schema: request.schema },
          },
        }),
      });
      const details = { provider: "anthropic" as const, model };
      if (response.status === 400 && (await creditTooLow(response))) {
        throw new AssistantFailure("quota", details);
      }
      if (!response.ok) throw failureForStatus(response.status, details);
      let body: MessagesResponse;
      try {
        body = (await response.json()) as MessagesResponse;
      } catch {
        throw new AssistantFailure("unreadable", details);
      }
      if (body.stop_reason === "refusal") throw new AssistantFailure("refused", details);
      // Réponse coupée : son JSON serait incomplet.
      if (body.stop_reason === "max_tokens") throw new AssistantFailure("unreadable", details);
      const text = (body.content ?? [])
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text)
        .join("");
      if (text.trim() === "") throw new AssistantFailure("unreadable", details);
      return text;
    },
  };
}
