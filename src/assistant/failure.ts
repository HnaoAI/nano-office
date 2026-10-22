// Échec d'une demande à l'assistant (T3.1, critère 14), commun aux deux fournisseurs.
import type { AssistantFailureDetails, AssistantFailureKind } from "../core/assistant";

/** Échec d'une demande, avec sa raison (message : `failureMessage` de core/assistant.ts). */
export class AssistantFailure extends Error {
  constructor(
    readonly kind: AssistantFailureKind,
    readonly details: AssistantFailureDetails = {},
  ) {
    super(kind);
    this.name = "AssistantFailure";
  }
}

/** Nombre maximal de jetons de la réponse : 5 000 mots corrigés ou traduits y tiennent. */
export const MAX_OUTPUT_TOKENS = 16_000;

/** Raison d'un échec HTTP commune aux deux fournisseurs. */
export function failureForStatus(
  status: number,
  details: AssistantFailureDetails,
): AssistantFailure {
  if (status === 401 || status === 403) return new AssistantFailure("auth", details);
  if (status === 404) return new AssistantFailure("model", details);
  if (status === 402 || status === 429) return new AssistantFailure("quota", details);
  if (status >= 500) return new AssistantFailure("busy", details);
  return new AssistantFailure("failed", { ...details, status });
}
