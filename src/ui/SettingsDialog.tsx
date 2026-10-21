// Boîte « Réglages » (T3.1, critères 1 à 3), au style de la boîte « Mise en page » (dialog.css) :
// section « Assistant IA », avec interrupteur, fournisseur, clé d'API masquée, modèle et texte
// sur les données envoyées. Rien n'est enregistré avant « Enregistrer », sauf « Oublier la clé ».
import { useEffect, useId, useState } from "react";
import {
  DEFAULT_MODELS,
  PROVIDER_LABELS,
  type AssistantProviderId,
  type AssistantSettings,
} from "../core/assistant";
import type { AssistantKeys } from "../storage/assistantSettingsStore";
import { GearIcon } from "./icons";

/** Conditions de l'API Gemini sur les données de l'offre gratuite, lues le 2026-10-21. */
export const GEMINI_TERMS_URL = "https://ai.google.dev/gemini-api/terms#unpaid-services";

const PROVIDERS: AssistantProviderId[] = ["anthropic", "gemini"];

/**
 * Boîte « Réglages ».
 * @param settings réglages enregistrés
 * @param keys clés d'API enregistrées
 * @param onSave enregistre les réglages et les clés, puis ferme la boîte
 * @param onForgetKeys efface tout de suite les clés de cet ordinateur (critère 3)
 * @param onCancel ferme la boîte sans rien changer (Annuler, Échap, clic à côté)
 */
export function SettingsDialog({
  settings,
  keys,
  onSave,
  onForgetKeys,
  onCancel,
}: {
  settings: AssistantSettings;
  keys: AssistantKeys;
  onSave: (settings: AssistantSettings, keys: AssistantKeys) => void;
  onForgetKeys: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [provider, setProvider] = useState(settings.provider);
  const [models, setModels] = useState(settings.models);
  const [draftKeys, setDraftKeys] = useState<AssistantKeys>(keys);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const key = draftKeys[provider] ?? "";
  const model = models[provider];
  const { name, company } = PROVIDER_LABELS[provider];
  // Allumé, l'assistant a besoin d'une clé et d'un modèle.
  const valid = !enabled || (key.trim() !== "" && model.trim() !== "");
  const hasKeys = Object.values(draftKeys).some((value) => value && value.trim() !== "");

  return (
    <div className="nano-dialog-layer">
      <div className="nano-dialog-backdrop" aria-hidden="true" onClick={onCancel} />
      <form
        className="nano-dialog nano-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          const trimmed = { ...models, [provider]: model.trim() || DEFAULT_MODELS[provider] };
          onSave({ enabled, provider, models: trimmed }, draftKeys);
        }}
      >
        <span className="nano-dialog-icon" aria-hidden="true">
          <GearIcon size={22} />
        </span>
        <div className="nano-dialog-text">
          <h2 id={`${id}-title`}>Réglages</h2>
          <p>Ces réglages restent sur cet ordinateur.</p>
        </div>
        <fieldset className="nano-page-setup-group">
          <legend>Assistant IA</legend>
          <label className="nano-settings-switch">
            <input
              type="checkbox"
              role="switch"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              autoFocus
            />
            <span>Activer l'assistant (corriger, traduire en anglais)</span>
          </label>
          {enabled && (
            <>
              <div className="nano-page-setup-options" role="radiogroup" aria-label="Fournisseur">
                {PROVIDERS.map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name={`${id}-provider`}
                      value={value}
                      checked={provider === value}
                      onChange={() => setProvider(value)}
                    />
                    <span>
                      {PROVIDER_LABELS[value].name} <small>{PROVIDER_LABELS[value].company}</small>
                    </span>
                  </label>
                ))}
              </div>
              <label className="nano-settings-field">
                <span>Clé d'API {name}</span>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={key}
                  onChange={(event) =>
                    setDraftKeys({ ...draftKeys, [provider]: event.target.value })
                  }
                />
              </label>
              <label className="nano-settings-field">
                <span>Modèle</span>
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={model}
                  onChange={(event) => setModels({ ...models, [provider]: event.target.value })}
                />
              </label>
              <div className="nano-settings-notice" role="note">
                <p>
                  À chaque clic sur « Corriger » ou « Traduire en anglais », le texte sélectionné
                  est envoyé à {company}, et seulement lui : ni le reste du document, ni les images,
                  ni le nom du fichier. Rien n'est envoyé autrement.
                </p>
                <p>
                  La clé reste sur cet ordinateur, dans le navigateur. Elle n'est jamais écrite dans
                  vos documents.
                </p>
                {provider === "gemini" && (
                  <p>
                    Avec l'offre gratuite de Gemini, Google peut utiliser les textes envoyés pour
                    améliorer ses produits, et des personnes peuvent les relire : n'envoyez pas de
                    texte personnel avec une clé gratuite. Vérifiez les{" "}
                    <a href={GEMINI_TERMS_URL} target="_blank" rel="noreferrer">
                      conditions de l'API Gemini
                    </a>{" "}
                    du moment.
                  </p>
                )}
              </div>
            </>
          )}
        </fieldset>
        <div className="nano-dialog-buttons">
          <button type="submit" className="nano-dialog-primary" disabled={!valid}>
            Enregistrer
          </button>
          {hasKeys && (
            <button
              type="button"
              onClick={() => {
                setDraftKeys({});
                setEnabled(false);
                onForgetKeys();
              }}
            >
              Oublier la clé
            </button>
          )}
          <button type="button" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
