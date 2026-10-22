// Gemini (Google) : méthode generateContent de l'API Gemini, appelée directement depuis le navigateur
// avec la clé de l'utilisateur (T3.1). Pas de SDK : celui de Google tire une vingtaine de paquets
// pour un seul appel. Documentation : https://ai.google.dev/api/generate-content et
// https://ai.google.dev/gemini-api/docs/generate-content/structured-output
import type { AssistantRequest } from "../core/assistant";
import { AssistantFailure, failureForStatus, MAX_OUTPUT_TOKENS } from "./failure";
import type { AssistantProvider } from "./provider";

/** Adresse de base des modèles Gemini. */
export const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/";

/** Réponse de generateContent, réduite à ce qui est lu. */
interface GenerateContentResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

/** Erreur renvoyée par l'API Gemini. */
interface GeminiError {
  error?: { details?: { reason?: string }[] };
}

/**
 * Fournisseur Gemini.
 * - La clé passe dans l'en-tête `x-goog-api-key`, jamais dans l'adresse, pour ne pas apparaître
 *   dans un journal.
 * - La réponse est demandée en JSON du schéma (`responseMimeType` et `responseJsonSchema`, les champs
 *   qu'envoie aussi le SDK officiel @google/genai 2.30).
 * - Une clé invalide répond 400 avec la raison `API_KEY_INVALID` : elle devient « auth ».
 */
export function createGeminiProvider(
  model: string,
  apiKey: string,
  fetcher: typeof fetch,
): AssistantProvider {
  return {
    id: "gemini",
    model,
    async send(request: AssistantRequest, signal: AbortSignal) {
      const response = await fetcher(`${GEMINI_URL}${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: "user", parts: [{ text: request.user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: request.schema,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          },
        }),
      });
      const details = { provider: "gemini" as const, model };
      if (!response.ok) {
        if (response.status === 400) {
          const error = (await response.json().catch(() => ({}))) as GeminiError;
          if (error.error?.details?.some((detail) => detail.reason === "API_KEY_INVALID")) {
            throw new AssistantFailure("auth", details);
          }
        }
        throw failureForStatus(response.status, details);
      }
      let body: GenerateContentResponse;
      try {
        body = (await response.json()) as GenerateContentResponse;
      } catch {
        throw new AssistantFailure("unreadable", details);
      }
      if (body.promptFeedback?.blockReason) throw new AssistantFailure("refused", details);
      const candidate = body.candidates?.[0];
      if (candidate?.finishReason === "SAFETY") throw new AssistantFailure("refused", details);
      if (candidate?.finishReason === "MAX_TOKENS")
        throw new AssistantFailure("unreadable", details);
      const text = (candidate?.content?.parts ?? [])
        .filter((part) => !part.thought && typeof part.text === "string")
        .map((part) => part.text)
        .join("");
      if (text.trim() === "") throw new AssistantFailure("unreadable", details);
      return text;
    },
  };
}
