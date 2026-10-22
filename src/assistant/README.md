# src/assistant

Appels à l'assistant facultatif (T3.1), derrière l'interface `AssistantProvider`. Seul code de
l'application qui envoie des données : le texte sélectionné, après un clic, au fournisseur choisi.
La logique (consignes, lecture de la réponse, propositions) est dans `core/assistant.ts`.

- `provider.ts` : interface `AssistantProvider`, choix du fournisseur (`createProvider`), délai de 30 secondes et annulation (`sendWithTimeout`)
- `anthropic.ts` : Claude, API Messages appelée depuis le navigateur, réponse en JSON du schéma
- `gemini.ts` : Gemini, méthode `generateContent`, clé dans l'en-tête, réponse en JSON du schéma
- `failure.ts` : échec d'une demande et sa raison (`AssistantFailure`, `failureForStatus`)
