// Parties « Numéros de page » (T2.15, critère 1) et « En-tête et pied de page » (T2.16, critères 1 et 4)
// de la boîte « Mise en page », au style de ses autres choix (dialog.css). Ne modifie rien : la boîte
// applique les réglages avec « Appliquer ».
import { useId, type ReactNode } from "react";
import {
  MAX_MARGIN_TEXT,
  type HeaderFooter,
  type MarginText,
  type MarginTextAlign,
  type PageNumberPosition,
} from "../core/headerFooter";
import { AlignCenterIcon, AlignLeftIcon, AlignRightIcon } from "./icons";

/** Champ à qui donner le focus à l'ouverture (double clic sur l'en-tête ou le pied de page, T2.16). */
export type HeaderFooterField = "header" | "footer";

const POSITIONS: { value: PageNumberPosition; label: string }[] = [
  { value: "center", label: "En bas au centre" },
  { value: "right", label: "En bas à droite" },
];

const ALIGNS: { value: MarginTextAlign; label: string; icon: ReactNode }[] = [
  { value: "left", label: "Aligner à gauche", icon: <AlignLeftIcon /> },
  { value: "center", label: "Centrer", icon: <AlignCenterIcon /> },
  { value: "right", label: "Aligner à droite", icon: <AlignRightIcon /> },
];

/** Une case à cocher au style des options de la recherche. */
function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="nano-page-setup-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {children}
    </label>
  );
}

/** Une ligne de texte (en-tête ou pied de page) et ses trois alignements. */
function MarginTextField({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: MarginText;
  onChange: (value: MarginText) => void;
  autoFocus: boolean;
}) {
  const id = useId();
  return (
    <div className="nano-page-setup-text">
      <label htmlFor={`${id}-text`}>{label}</label>
      <input
        id={`${id}-text`}
        type="text"
        value={value.text}
        maxLength={MAX_MARGIN_TEXT * 2}
        spellCheck
        autoFocus={autoFocus}
        onChange={(event) => onChange({ ...value, text: event.target.value })}
      />
      {/* Boutons à bascule, comme les boutons d'alignement de la barre de mise en forme (T1.3). */}
      <div className="nano-page-setup-aligns" role="group" aria-label={`Alignement : ${label}`}>
        {ALIGNS.map((align) => (
          <button
            key={align.value}
            type="button"
            aria-label={align.label}
            aria-pressed={value.align === align.value}
            title={align.label}
            onClick={() => onChange({ ...value, align: align.value })}
          >
            {align.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Réglages des numéros de page, de l'en-tête et du pied de page.
 * @param value réglages en cours dans la boîte (pas encore appliqués)
 * @param onChange appelé à chaque changement
 * @param focus champ à qui donner le focus à l'ouverture, ou null
 */
export function HeaderFooterFields({
  value,
  onChange,
  focus,
}: {
  value: HeaderFooter;
  onChange: (value: HeaderFooter) => void;
  focus: HeaderFooterField | null;
}) {
  const id = useId();
  const numbers = value.pageNumbers;
  return (
    <>
      <fieldset className="nano-page-setup-group">
        <legend>Numéros de page</legend>
        <Check
          checked={numbers !== null}
          onChange={(checked) =>
            onChange({
              ...value,
              pageNumbers: checked ? { position: "center", skipFirst: false } : null,
            })
          }
        >
          Numéroter les pages
        </Check>
        {numbers && (
          <>
            <div className="nano-page-setup-options">
              {POSITIONS.map((position) => (
                <label key={position.value}>
                  <input
                    type="radio"
                    name={`${id}-position`}
                    value={position.value}
                    checked={numbers.position === position.value}
                    onChange={() =>
                      onChange({ ...value, pageNumbers: { ...numbers, position: position.value } })
                    }
                  />
                  <span>{position.label}</span>
                </label>
              ))}
            </div>
            <Check
              checked={numbers.skipFirst}
              onChange={(skipFirst) =>
                onChange({ ...value, pageNumbers: { ...numbers, skipFirst } })
              }
            >
              Pas de numéro sur la première page
            </Check>
          </>
        )}
      </fieldset>
      <fieldset className="nano-page-setup-group">
        <legend>En-tête et pied de page</legend>
        <MarginTextField
          label="En-tête"
          value={value.header}
          autoFocus={focus === "header"}
          onChange={(header) => onChange({ ...value, header })}
        />
        <MarginTextField
          label="Pied de page"
          value={value.footer}
          autoFocus={focus === "footer"}
          onChange={(footer) => onChange({ ...value, footer })}
        />
        <Check
          checked={value.skipFirst}
          onChange={(skipFirst) => onChange({ ...value, skipFirst })}
        >
          Pas d'en-tête ni de pied de page sur la première page
        </Check>
      </fieldset>
    </>
  );
}
