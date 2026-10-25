// Boîte de dialogue « Mise en page » (T2.5, critère 1) : orientation et marges d'une page A4, au style
// de la question de la copie de secours (dialog.css), puis numéros de page (T2.15), en-tête et pied de
// page (T2.16, dans HeaderFooterFields.tsx). Ne modifie le document qu'avec « Appliquer ».
import { useEffect, useId, useState } from "react";
import {
  MARGIN_PRESETS,
  MAX_MARGIN_CM,
  MIN_MARGIN_CM,
  marginChoice,
  formatCm,
  parseCm,
  uniformMargins,
  type MarginChoice,
  type PageMargins,
  type PageOrientation,
  type PageSetup,
} from "../core/pageSetup";
import type { HeaderFooter } from "../core/headerFooter";
import { HeaderFooterFields, type HeaderFooterField } from "./HeaderFooterFields";
import { PageSetupIcon } from "./icons";

const SIDES: { key: keyof PageMargins; label: string }[] = [
  { key: "top", label: "Haut" },
  { key: "bottom", label: "Bas" },
  { key: "left", label: "Gauche" },
  { key: "right", label: "Droite" },
];

/**
 * Boîte « Mise en page ».
 * @param current mise en page actuelle du document
 * @param currentHeaderFooter numéros, en-tête et pied de page actuels du document (T2.15, T2.16)
 * @param focus champ à qui donner le focus à l'ouverture (double clic sur l'en-tête ou le pied de page),
 *   ou null pour l'orientation
 * @param onApply appelé avec la nouvelle mise en page et les nouveaux numéros, en-tête et pied de page,
 *   une seule fois
 * @param onCancel ferme la boîte sans rien changer (Annuler, Échap, clic à côté)
 */
export function PageSetupDialog({
  current,
  currentHeaderFooter,
  focus = null,
  onApply,
  onCancel,
}: {
  current: PageSetup;
  currentHeaderFooter: HeaderFooter;
  focus?: HeaderFooterField | null;
  onApply: (setup: PageSetup, headerFooter: HeaderFooter) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [headerFooter, setHeaderFooter] = useState<HeaderFooter>(currentHeaderFooter);
  const [orientation, setOrientation] = useState<PageOrientation>(current.orientation);
  const [choice, setChoice] = useState<MarginChoice>(marginChoice(current.margins));
  const [fields, setFields] = useState<Record<keyof PageMargins, string>>(() => ({
    top: formatCm(current.margins.top),
    bottom: formatCm(current.margins.bottom),
    left: formatCm(current.margins.left),
    right: formatCm(current.margins.right),
  }));

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

  const custom = SIDES.map(({ key }) => [key, parseCm(fields[key])] as const);
  const customValid = custom.every(([, value]) => value !== null);
  const margins: PageMargins | null =
    choice === "custom"
      ? customValid
        ? (Object.fromEntries(custom) as unknown as PageMargins)
        : null
      : uniformMargins(MARGIN_PRESETS.find((preset) => preset.id === choice)?.cm ?? 2.5);

  const choosePreset = (next: MarginChoice) => {
    setChoice(next);
    const preset = MARGIN_PRESETS.find((entry) => entry.id === next);
    // Personnalisées part des marges du préréglage choisi juste avant.
    if (preset) {
      const text = formatCm(preset.cm);
      setFields({ top: text, bottom: text, left: text, right: text });
    }
  };

  return (
    <div className="nano-dialog-layer">
      <div className="nano-dialog-backdrop" aria-hidden="true" onClick={onCancel} />
      <form
        className="nano-dialog nano-page-setup"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onSubmit={(event) => {
          event.preventDefault();
          if (margins) onApply({ orientation, margins }, headerFooter);
        }}
      >
        <span className="nano-dialog-icon" aria-hidden="true">
          <PageSetupIcon size={22} />
        </span>
        <div className="nano-dialog-text">
          <h2 id={`${id}-title`}>Mise en page</h2>
          <p>Page A4. Ces réglages sont enregistrés avec le document.</p>
        </div>
        <fieldset className="nano-page-setup-group">
          <legend>Orientation</legend>
          <div className="nano-page-setup-options">
            {(
              [
                ["portrait", "Portrait"],
                ["landscape", "Paysage"],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name={`${id}-orientation`}
                  value={value}
                  checked={orientation === value}
                  onChange={() => setOrientation(value)}
                  autoFocus={focus === null && current.orientation === value}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="nano-page-setup-group">
          <legend>Marges</legend>
          <div className="nano-page-setup-options">
            {MARGIN_PRESETS.map((preset) => (
              <label key={preset.id}>
                <input
                  type="radio"
                  name={`${id}-margins`}
                  value={preset.id}
                  checked={choice === preset.id}
                  onChange={() => choosePreset(preset.id)}
                />
                <span>
                  {preset.label} <small>{formatCm(preset.cm)} cm</small>
                </span>
              </label>
            ))}
            <label>
              <input
                type="radio"
                name={`${id}-margins`}
                value="custom"
                checked={choice === "custom"}
                onChange={() => setChoice("custom")}
              />
              <span>Personnalisées</span>
            </label>
          </div>
          {choice === "custom" && (
            <div className="nano-page-setup-sides">
              {SIDES.map(({ key, label }) => {
                const invalid = parseCm(fields[key]) === null;
                return (
                  <label key={key}>
                    <span>{label}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={fields[key]}
                      aria-invalid={invalid}
                      aria-describedby={`${id}-range`}
                      onChange={(event) => setFields({ ...fields, [key]: event.target.value })}
                    />
                    <span aria-hidden="true">cm</span>
                  </label>
                );
              })}
              <p
                id={`${id}-range`}
                className={`nano-page-setup-range${customValid ? "" : " nano-page-setup-range-invalid"}`}
              >
                De {formatCm(MIN_MARGIN_CM)} à {formatCm(MAX_MARGIN_CM)} cm.
              </p>
            </div>
          )}
        </fieldset>
        <HeaderFooterFields value={headerFooter} onChange={setHeaderFooter} focus={focus} />
        <div className="nano-dialog-buttons">
          <button type="submit" className="nano-dialog-primary" disabled={margins === null}>
            Appliquer
          </button>
          <button type="button" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
