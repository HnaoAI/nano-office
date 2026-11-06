// Espaces entre les feuilles séparées (PL6) : un bloc vide, posé par une décoration avant le premier bloc ou la
// première ligne de chaque page après la première, qui pousse le texte en haut de la feuille suivante. Sans React.
// INVARIANT : ce sont des décorations, jamais des nœuds : le document, le fichier, la copie de secours, le
// presse-papiers et l'historique d'annulation n'en voient rien (critère 3). L'impression les cache (print.css).
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/** Classe de l'espace entre deux feuilles (src/ui/styles/pages.css). */
export const SHEET_GAP_CLASS = "nano-sheet-gap";

/** Classe posée sur la pile de feuilles pendant la mesure : les espaces sont cachés, le texte est mesuré d'un seul tenant. */
export const SHEETS_MEASURING_CLASS = "nano-sheets-measuring";

/** Un espace entre feuilles : avant la position `pos` du document, au début de la page `page`. */
export interface SheetGap {
  page: number;
  pos: number;
}

interface SheetGapsState {
  gaps: SheetGap[];
  decorations: DecorationSet;
}

/** Clé du plugin, pour lire les espaces posés. */
export const sheetGapsKey = new PluginKey<SheetGapsState>("sheetGaps");

/**
 * Hauteurs des espaces de chaque éditeur, par numéro de page : un espace recréé par ProseMirror (après une
 * modification proche) reprend aussitôt sa hauteur, sans attendre le calcul suivant.
 */
const gapHeights = new WeakMap<EditorView, Map<number, number>>();

function heightsOf(view: EditorView): Map<number, number> {
  let heights = gapHeights.get(view);
  if (!heights) {
    heights = new Map();
    gapHeights.set(view, heights);
  }
  return heights;
}

/**
 * Élément d'un espace : vide, hors de la saisie, ignoré des lecteurs d'écran. Aussi posé à la main entre deux lignes
 * d'un sommaire, dont la vue n'a pas de positions du document.
 */
export function createSheetGapElement(
  view: EditorView,
  page: number,
  inline: boolean,
): HTMLElement {
  const element = document.createElement("div");
  element.className = SHEET_GAP_CLASS;
  element.dataset.page = String(page);
  // Dans un paragraphe coupé, l'espace finit la ligne : la suivante commence sous lui (PL6, critère 2).
  if (inline) element.dataset.inline = "true";
  element.contentEditable = "false";
  element.setAttribute("aria-hidden", "true");
  element.style.height = `${String(heightsOf(view).get(page) ?? 0)}px`;
  return element;
}

function decorate(state: EditorState, gaps: readonly SheetGap[]): DecorationSet {
  const size = state.doc.content.size;
  return DecorationSet.create(
    state.doc,
    gaps
      .filter(({ pos }) => pos >= 0 && pos <= size)
      .map(({ page, pos }) => {
        const inline = state.doc.resolve(pos).parent.inlineContent;
        return Decoration.widget(pos, (view) => createSheetGapElement(view, page, inline), {
          side: -1,
          ignoreSelection: true,
          key: `sheet-gap-${String(page)}-${String(pos)}`,
        });
      }),
  );
}

/** Espaces posés, aux positions suivies à chaque modification. */
export function sheetGaps(state: EditorState): SheetGap[] {
  return sheetGapsKey.getState(state)?.gaps ?? [];
}

/**
 * Pose les espaces entre feuilles, s'ils ont changé. La transaction ne touche pas le document et n'entre pas dans
 * l'historique d'annulation.
 */
export function setSheetGaps(view: EditorView, gaps: SheetGap[]): void {
  const current = sheetGaps(view.state);
  const same =
    current.length === gaps.length &&
    current.every((gap, index) => gap.page === gaps[index]?.page && gap.pos === gaps[index]?.pos);
  if (same) return;
  view.dispatch(view.state.tr.setMeta(sheetGapsKey, gaps).setMeta("addToHistory", false));
}

/**
 * Donne leur hauteur aux espaces affichés (les espaces sans hauteur connue restent vides).
 * @param heights hauteur de chaque espace, par numéro de page
 */
export function setSheetGapHeights(view: EditorView, heights: ReadonlyMap<number, number>): void {
  const stored = heightsOf(view);
  stored.clear();
  for (const [page, height] of heights) stored.set(page, height);
  for (const element of view.dom.querySelectorAll<HTMLElement>(`.${SHEET_GAP_CLASS}`)) {
    const height = `${String(stored.get(Number(element.dataset.page)) ?? 0)}px`;
    if (element.style.height !== height) element.style.height = height;
  }
}

/** Extension des espaces entre feuilles. */
export const SheetGaps = Extension.create({
  name: "sheetGaps",
  addProseMirrorPlugins() {
    return [
      new Plugin<SheetGapsState>({
        key: sheetGapsKey,
        state: {
          init: (_config, state) => ({
            gaps: [],
            decorations: DecorationSet.create(state.doc, []),
          }),
          apply: (tr, value, _old, state) => {
            const next = tr.getMeta(sheetGapsKey) as SheetGap[] | undefined;
            if (next) return { gaps: next, decorations: decorate(state, next) };
            if (!tr.docChanged) return value;
            const gaps = value.gaps.map((gap) => ({ ...gap, pos: tr.mapping.map(gap.pos, -1) }));
            return { gaps, decorations: value.decorations.map(tr.mapping, tr.doc) };
          },
        },
        props: {
          decorations: (state) => sheetGapsKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});
