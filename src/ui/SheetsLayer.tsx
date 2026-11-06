// Feuilles séparées à l'écran (PL6) : sous le texte, une feuille blanche par page, séparée de la suivante par un espace
// gris ; au-dessus, l'en-tête, le pied de page et le numéro de chaque feuille, dans ses marges, en gris discret
// (critères 1 et 5). Calques posés sur la pile de feuilles, hors du document : rien n'est enregistré, rien ne
// s'imprime (print.css). Remplace les repères en pointillé de T2.8 et le calque de l'en-tête de T2.16.
import { marginBoxes, type HeaderFooter, type MarginPart } from "../core/headerFooter";
import type { Sheet } from "../core/sheets";
import type { HeaderFooterField } from "./HeaderFooterFields";

const ALIGNS = ["left", "center", "right"] as const;

/** Texte d'une zone de marge, le numéro de la page compris. */
function partsText(parts: readonly MarginPart[], page: number): string {
  return parts.map((part) => (part.kind === "page" ? String(page) : part.text)).join("");
}

/**
 * Fond des feuilles : le gris de l'application, qui couvre la pile (.nano-page) et l'ombre de ses côtés, puis une
 * feuille blanche par page, avec son ombre.
 * @param sheets feuilles, en pixels depuis le haut de la pile
 */
export function SheetsBackground({ sheets }: { sheets: readonly Sheet[] }) {
  return (
    <div className="nano-sheets" aria-hidden="true">
      <div className="nano-sheets-backdrop" />
      {sheets.map((sheet) => (
        <div
          key={sheet.page}
          className="nano-sheet"
          data-page={sheet.page}
          style={{ top: `${String(sheet.top)}px`, height: `${String(sheet.height)}px` }}
        />
      ))}
    </div>
  );
}

/**
 * Rôle d'un texte de marge, repris des classes de T2.16 : en-tête de la première page (`first`) ou des suivantes
 * (`below`, sous l'espace qui précède la feuille), pied de page de la dernière page (`last`) ou des autres (`above`),
 * numéro de page seul (`number`).
 */
type MarginRole = "first" | "below" | "last" | "above" | "number";

/** Un texte de marge affiché : un double clic ouvre « Mise en page » sur son champ. */
function MarginLabel({
  side,
  align,
  role,
  text,
  onEdit,
}: {
  side: "top" | "bottom";
  align: string;
  role: MarginRole;
  text: string;
  onEdit: (field: HeaderFooterField) => void;
}) {
  const field: HeaderFooterField = side === "top" ? "header" : "footer";
  return (
    <div
      className={`nano-margin-text nano-margin-${side} nano-margin-text-${role}`}
      style={{ textAlign: align as "left" | "center" | "right" }}
    >
      <span
        data-field={field}
        title={
          field === "header"
            ? "En-tête : double-cliquez pour le modifier"
            : "Pied de page : double-cliquez pour le modifier"
        }
        onDoubleClick={(event) => {
          event.preventDefault();
          onEdit(field);
        }}
      >
        {text}
      </span>
    </div>
  );
}

/**
 * En-tête, pied de page et numéro de chaque feuille, dans ses marges, comme à l'impression : rien sur la première page
 * si une case le demande (T2.15, T2.16). Un pied de page aligné comme le numéro partage sa place : « texte – 3 ».
 * Seul le texte reçoit les clics : un double clic ouvre « Mise en page » sur son champ.
 * @param sheets feuilles, en pixels depuis le haut de la pile
 * @param settings numéros, en-tête et pied de page du document
 * @param onEdit ouvre « Mise en page… » avec le focus sur le champ double-cliqué
 */
export function SheetMarginsLayer({
  sheets,
  settings,
  onEdit,
}: {
  sheets: readonly Sheet[];
  settings: HeaderFooter;
  onEdit: (field: HeaderFooterField) => void;
}) {
  const others = marginBoxes(settings, false);
  const first = marginBoxes(settings, true);
  if (Object.keys(others.top).length + Object.keys(others.bottom).length === 0) return null;
  const lastPage = sheets.at(-1)?.page ?? 1;
  return (
    <div className="nano-margin-texts">
      {sheets.map((sheet) => {
        const boxes = sheet.page === 1 ? first : others;
        return (
          <div
            key={sheet.page}
            className="nano-sheet-margins"
            data-page={sheet.page}
            style={{ top: `${String(sheet.top)}px`, height: `${String(sheet.height)}px` }}
          >
            {(["top", "bottom"] as const).flatMap((side) =>
              ALIGNS.map((align) => {
                const parts = boxes[side][align];
                if (!parts) return null;
                const withText = parts.some((part) => part.kind === "text");
                let role: MarginRole;
                if (side === "top") role = sheet.page === 1 ? "first" : "below";
                else if (!withText) role = "number";
                else role = sheet.page === lastPage ? "last" : "above";
                return (
                  <MarginLabel
                    key={`${side}-${align}`}
                    side={side}
                    align={align}
                    role={role}
                    text={partsText(parts, sheet.page)}
                    onEdit={onEdit}
                  />
                );
              }),
            )}
          </div>
        );
      })}
    </div>
  );
}
