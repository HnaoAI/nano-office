// Statistiques de « Mes fautes » (T2.23) partagées par l'interface : corrections acceptées comptées,
// fenêtre tenue à jour, remise à zéro. Le calcul est dans core/mistakes.ts, le rangement dans
// storage/mistakeStatsStore.ts. Un seul compte par ordinateur, commun à tous les documents.
import { useSyncExternalStore } from "react";
import {
  emptyMistakeStats,
  recordMistakes,
  type AcceptedMistake,
  type MistakeStats,
} from "../core/mistakes";
import type { Suggestion } from "../editor/suggestions";
import { loadMistakeStats, saveMistakeStats } from "../storage/mistakeStatsStore";

let current: MistakeStats | null = null;
const listeners = new Set<() => void>();

function snapshot(): MistakeStats {
  current ??= loadMistakeStats();
  return current;
}

function publish(next: MistakeStats) {
  saveMistakeStats(next);
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Compte des corrections acceptées (critère 5), passé à `acceptSuggestions`. Les statistiques sont
 * relues juste avant, pour ne pas effacer ce qu'une autre fenêtre de Nano Buro vient de compter.
 */
export function recordAcceptedSuggestions(accepted: Suggestion[]): void {
  if (accepted.length === 0) return;
  const entries: AcceptedMistake[] = accepted.map((suggestion) => ({
    type: suggestion.mistake ?? "other",
    before: suggestion.removed,
    after: suggestion.insert,
  }));
  publish(recordMistakes(loadMistakeStats(), entries));
}

/** « Remettre à zéro » (critère 14) : nombres et exemples effacés, la date de début repart. */
export function resetMistakeStats(): void {
  publish(emptyMistakeStats(new Date()));
}

/** Statistiques à jour de cet ordinateur, relues à chaque ouverture de la fenêtre. */
export function useMistakeStats(): MistakeStats {
  return useSyncExternalStore(subscribe, snapshot);
}

/** Relit les statistiques du stockage (ouverture de la fenêtre : une autre fenêtre a pu compter). */
export function refreshMistakeStats(): void {
  current = loadMistakeStats();
  for (const listener of listeners) listener();
}
