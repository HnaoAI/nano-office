// Repères de page dans la feuille continue (T2.8, critères 1, 2 et 9) : un trait fin en pointillé à chaque
// fin de page, de bord à bord, et le numéro de la page suivante dans la marge de droite, juste dessous.
// Calque posé sur la feuille, hors du document : rien n'est enregistré, rien ne reçoit les clics, rien ne
// s'imprime (src/ui/styles/print.css).
import type { PageStart } from "../core/pageBreaks";

/**
 * Calque des repères de page.
 * @param starts débuts des pages 2 et suivantes, en pixels depuis le haut de la zone de texte
 * @param offset haut de la zone de texte, en pixels depuis le haut de la feuille
 */
export function PageMarksLayer({ starts, offset }: { starts: PageStart[]; offset: number }) {
  return (
    <ol className="nano-page-marks" aria-hidden="true">
      {starts.map(({ page, y }) => (
        <li key={page} className="nano-page-mark" style={{ top: `${String(offset + y)}px` }}>
          <span className="nano-page-number">{page}</span>
        </li>
      ))}
    </ol>
  );
}
