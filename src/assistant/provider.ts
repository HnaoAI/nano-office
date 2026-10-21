// Appel au fournisseur de l'assistant (T3.1) derrière une interface : Claude (anthropic.ts) ou Gemini
// (gemini.ts), avec la clé de l'utilisateur. Seul endroit de l'application qui envoie des données.
// INVARIANT : seules `api.anthropic.com` et `generativelanguage.googleapis.com` sont appelées, et
// seulement après un clic (critère 13). La clé ne part que vers le fournisseur choisi (critère 3).
import {
  ASSISTANT_TIMEOUT_MS,
  type AssistantProviderId,
  type AssistantRequest,
} from "../core/assistant";
import { createAnthropicProvider } from "./anthropic";
import { AssistantFailure } from "./failure";
import { createGeminiProvider } from "./gemini";

/** Un fournisseur : envoie une demande et renvoie le texte de la réponse, sans l'interpréter. */
export interface AssistantProvider {
  readonly id: AssistantProviderId;
  readonly model: string;
  /**
   * @param signal annule la demande (Échap, délai dépassé)
   * @throws AssistantFailure (clé refusée, quota, service indisponible, réponse sans texte…)
   */
  send(request: AssistantRequest, signal: AbortSignal): Promise<string>;
}

/** Ce qu'il faut pour créer un fournisseur. */
export interface ProviderConfig {
  provider: AssistantProviderId;
  model: string;
  apiKey: string;
  /** Remplaçable dans les tests ; `fetch` du navigateur sinon. */
  fetch?: typeof fetch;
}

/** Crée le fournisseur choisi dans les réglages. */
export function createProvider(config: ProviderConfig): AssistantProvider {
  const fetcher = config.fetch ?? ((input, init) => fetch(input, init));
  return config.provider === "anthropic"
    ? createAnthropicProvider(config.model, config.apiKey, fetcher)
    : createGeminiProvider(config.model, config.apiKey, fetcher);
}

/**
 * Envoie une demande, abandonnée au bout de 30 secondes (critère 14) ou sur `signal` (Échap,
 * critère 5). Toute erreur devient un `AssistantFailure`.
 */
export async function sendWithTimeout(
  provider: AssistantProvider,
  request: AssistantRequest,
  signal: AbortSignal,
  timeoutMs = ASSISTANT_TIMEOUT_MS,
): Promise<string> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = AbortSignal.any([signal, timeout]);
  const details = { provider: provider.id, model: provider.model };
  try {
    return await provider.send(request, combined);
  } catch (error) {
    if (signal.aborted) throw new AssistantFailure("cancelled", details);
    if (timeout.aborted) throw new AssistantFailure("timeout", details);
    if (error instanceof AssistantFailure) throw error;
    // `fetch` rejette sans réponse : pas de réseau, ou serveur injoignable.
    throw new AssistantFailure("offline", details);
  }
}
