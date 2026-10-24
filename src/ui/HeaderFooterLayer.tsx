// En-tête et pied de page à l'écran (T2.16, critère 3) : en gris clair dans la marge du haut de la première
// page et du bas de la dernière, et de part et d'autre de chaque repère de page de T2.8 (pied de la page
// qui finit au-dessus du trait, en-tête de la suivante dessous). Calque posé sur la feuille, hors du
// document : rien n'est enregistré ni imprimé (l'impression a ses propres zones de marge, print.css).
// Les numéros de page ne s'affichent pas à l'écran (T2.15, critère 4).
import type { HeaderFooter, MarginText } from "../core/headerFooter";
import type { PageStart } from "../core/pageBreaks";
import type { HeaderFooterField } from "./HeaderFooterFields";

/** Un texte de marge affiché : un double clic ouvre « Mise en page » sur son champ. */
function MarginLabel({
  field,
  text,
  place,
  top,
  onEdit,
}: {
  field: HeaderFooterField;
  text: MarginText;
  place: "first" | "last" | "above" | "below";
  top?: number;
  onEdit: (field: HeaderFooterField) => void;
}) {
  return (
    // Seul le texte reçoit les clics : à côté, un clic atteint le document dessous.
    <div
      className={`nano-margin-text nano-margin-text-${place}`}
      style={{ textAlign: text.align, top: top === undefined ? undefined : `${String(top)}px` }}
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
        {text.text}
      </span>
    </div>
  );
}

/**
 * Calque de l'en-tête et du pied de page.
 * @param settings numéros, en-tête et pied de page du document
 * @param starts débuts des pages 2 et suivantes (T2.8), en pixels depuis le haut de la zone de texte
 * @param offset haut de la zone de texte, en pixels depuis le haut de la feuille
 * @param onEdit ouvre « Mise en page… » avec le focus sur le champ double-cliqué
 */
export function HeaderFooterLayer({
  settings,
  starts,
  offset,
  onEdit,
}: {
  settings: HeaderFooter;
  starts: PageStart[];
  offset: number;
  onEdit: (field: HeaderFooterField) => void;
}) {
  const { header, footer, skipFirst } = settings;
  if (!header.text && !footer.text) return null;
  const lastIsFirst = starts.length === 0;
  return (
    <div className="nano-margin-texts">
      {header.text && !skipFirst && (
        <MarginLabel field="header" text={header} place="first" onEdit={onEdit} />
      )}
      {footer.text && !(lastIsFirst && skipFirst) && (
        <MarginLabel field="footer" text={footer} place="last" onEdit={onEdit} />
      )}
      {starts.map(({ page, y }) => (
        <div key={page}>
          {footer.text && !(page === 2 && skipFirst) && (
            <MarginLabel
              field="footer"
              text={footer}
              place="above"
              top={offset + y}
              onEdit={onEdit}
            />
          )}
          {header.text && (
            <MarginLabel
              field="header"
              text={header}
              place="below"
              top={offset + y}
              onEdit={onEdit}
            />
          )}
        </div>
      ))}
    </div>
  );
}
