// Hook React des réglages de l'assistant (T3.1) : lus au lancement, enregistrés par la boîte
// « Réglages », sur cet ordinateur seulement (src/storage/assistantSettingsStore.ts).
import { useCallback, useMemo, useState } from "react";
import type { AssistantProviderId, AssistantSettings } from "../core/assistant";
import {
  forgetAssistantKeys,
  loadAssistantKeys,
  loadAssistantSettings,
  saveAssistantKeys,
  saveAssistantSettings,
  type AssistantKeys,
} from "../storage/assistantSettingsStore";

/** Ce dont l'éditeur a besoin pour appeler l'assistant ; null quand il est éteint (critère 4). */
export interface AssistantConfig {
  provider: AssistantProviderId;
  model: string;
  /** null sans clé : les boutons s'affichent, et un clic demande la clé (critère 14). */
  apiKey: string | null;
}

/**
 * Réglages de l'assistant de cet ordinateur.
 * @returns `settings`, `keys`, `config` (null si l'assistant est éteint), `save` et `forgetKeys`
 */
export function useAssistantSettings() {
  const [settings, setSettings] = useState<AssistantSettings>(() => loadAssistantSettings());
  const [keys, setKeys] = useState<AssistantKeys>(() => loadAssistantKeys());

  const save = useCallback((next: AssistantSettings, nextKeys: AssistantKeys) => {
    saveAssistantSettings(next);
    saveAssistantKeys(nextKeys);
    setSettings(next);
    setKeys(loadAssistantKeys());
  }, []);

  // « Oublier la clé » (critère 3) : effet immédiat, sans attendre « Enregistrer ». Sans clé,
  // l'assistant s'éteint jusqu'à ce qu'une nouvelle clé soit enregistrée.
  const forgetKeys = useCallback(() => {
    forgetAssistantKeys();
    setKeys({});
    setSettings((current) => {
      const next = { ...current, enabled: false };
      saveAssistantSettings(next);
      return next;
    });
  }, []);

  // Même objet tant que rien ne change : l'éditeur ne relance rien à chaque rendu.
  const config = useMemo<AssistantConfig | null>(
    () =>
      settings.enabled
        ? {
            provider: settings.provider,
            model: settings.models[settings.provider],
            apiKey: keys[settings.provider] ?? null,
          }
        : null,
    [settings, keys],
  );
  return { settings, keys, config, save, forgetKeys };
}
