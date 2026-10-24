// Compte des mots du document affiché (T2.11) : recalculé au plus une fois par image affichée, après une
// modification ou un changement de sélection. Le comptage est dans src/core/wordCount.ts.
import type { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";
import { EMPTY_STATS, nodeStats, rangeStats, type TextStats } from "../core/wordCount";

/** Nom de la mesure de performance d'un comptage, lue par les tests d'interface (critère 4). */
export const WORD_COUNT_MEASURE = "nano-word-count";

/** Statistiques du document, et mots sélectionnés (null sans sélection). */
export interface WordCount {
  document: TextStats;
  selectedWords: number | null;
}

/**
 * Statistiques du document affiché.
 * INVARIANT : rien n'est écrit dans le document (critère 5) ; le compte n'est qu'affiché.
 * @param editor éditeur affiché
 */
export function useWordCount(editor: Editor): WordCount {
  const [count, setCount] = useState<WordCount>({ document: EMPTY_STATS, selectedWords: null });

  useEffect(() => {
    let frame = 0;
    const compute = () => {
      frame = 0;
      if (editor.isDestroyed) return;
      performance.mark(`${WORD_COUNT_MEASURE}-start`);
      const { doc, selection } = editor.state;
      const document = nodeStats(doc);
      const selectedWords = selection.empty
        ? null
        : rangeStats(
            doc,
            selection.ranges.map(({ $from, $to }) => ({ from: $from.pos, to: $to.pos })),
          ).words;
      performance.measure(WORD_COUNT_MEASURE, `${WORD_COUNT_MEASURE}-start`);
      setCount((previous) =>
        previous.document === document && previous.selectedWords === selectedWords
          ? previous
          : { document, selectedWords },
      );
    };
    // Au plus un calcul par image affichée, quel que soit le nombre de frappes (critère 4).
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(compute);
    };
    schedule();
    editor.on("transaction", schedule);
    return () => {
      cancelAnimationFrame(frame);
      editor.off("transaction", schedule);
    };
  }, [editor]);

  return count;
}
