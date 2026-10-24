// Compteur de mots du pied de page (T2.11) : « 1 234 mots », ou « 45 mots sur 1 234 » avec une sélection, et
// petite fenêtre des statistiques du document au clic, au style des petites fenêtres de la barre (T1.7).
import { useRef } from "react";
import { frenchNumber, wordCounterText } from "../core/wordCount";
import type { WordCount } from "./useWordCount";
import { usePopover } from "./usePopover";

/**
 * Bouton du compteur et fenêtre des statistiques : mots, caractères avec et sans espaces, paragraphes, pages
 * (critère 3). Échap ou un clic à côté la ferme.
 * @param count statistiques du document affiché
 * @param pages nombre de pages, celui des repères de page (T2.8)
 */
export function WordCounter({ count, pages }: { count: WordCount; pages: number }) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popover = usePopover(rootRef, buttonRef);
  const { document } = count;
  const rows: [string, number][] = [
    ["Mots", document.words],
    ["Caractères (espaces compris)", document.characters],
    ["Caractères (sans les espaces)", document.charactersNoSpaces],
    ["Paragraphes", document.paragraphs],
    ["Pages", pages],
  ];

  return (
    <span className="nano-popover-anchor nano-word-count" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="nano-word-count-button"
        aria-haspopup="dialog"
        aria-expanded={popover.open}
        title="Statistiques du document"
        onClick={popover.toggle}
      >
        {wordCounterText(document.words, count.selectedWords)}
      </button>
      {popover.open && (
        <div className="nano-popover nano-word-stats" role="dialog" aria-label="Statistiques">
          <table>
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{frenchNumber(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </span>
  );
}
