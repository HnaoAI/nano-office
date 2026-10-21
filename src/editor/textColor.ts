// Couleur du texte et surlignage dans l'éditeur (T1.7) : application à la sélection ou au texte tapé
// ensuite, et lecture de la couleur sous le curseur pour les boutons de la barre.
// La couleur est l'attribut `color` de la marque `textStyle` ; le surlignage, la marque `highlight`.
import type { Editor } from "@tiptap/core";
import type { Mark } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";

/**
 * Couleur sous le curseur : une seule (`value`, null pour aucune), ou plusieurs mélangées dans la
 * sélection (`mixed`), qui laissent le bouton neutre (critère 6).
 */
export type ColorAtCursor = { mixed: true } | { mixed: false; value: string | null };

/**
 * Applique une couleur du texte à la sélection, ou au texte tapé ensuite si rien n'est sélectionné
 * (critère 5), en une seule étape d'annulation. null (« Automatique ») retire la couleur, en gardant
 * la police et la taille.
 */
export function setTextColor(editor: Editor, color: string | null): boolean {
  return editor
    .chain()
    .setMark("textStyle", { color })
    .removeEmptyTextStyle()
    .command(({ tr }) => {
      // `removeEmptyTextStyle` ne touche que le texte sélectionné : sans sélection, la marque en
      // attente reste, vide, et serait posée sur le texte tapé ensuite.
      const pending = tr.storedMarks?.find((mark) => mark.type.name === "textStyle");
      if (pending && Object.values(pending.attrs).every((value) => value === null)) {
        tr.removeStoredMark(pending.type);
      }
      return true;
    })
    .run();
}

/**
 * Applique un surlignage à la sélection, ou au texte tapé ensuite (critère 5). null (« Aucun »)
 * retire le surlignage.
 */
export function setHighlight(editor: Editor, color: string | null): boolean {
  return color === null
    ? editor.chain().unsetMark("highlight").run()
    : editor.chain().setMark("highlight", { color }).run();
}

/** Couleur portée par les marques d'un morceau de texte, ou null. */
type ColorReader = (marks: readonly Mark[]) => string | null;

function attributeColor(mark: Mark | undefined): string | null {
  const color: unknown = mark?.attrs.color;
  return typeof color === "string" && color !== "" ? color : null;
}

const textColorOf: ColorReader = (marks) =>
  attributeColor(marks.find((mark) => mark.type.name === "textStyle"));

// Un surlignage sans couleur (`<mark>` d'une version future) compte comme un surlignage jaune du
// navigateur : il n'est pas « Aucun ».
const highlightOf: ColorReader = (marks) => {
  const mark = marks.find((candidate) => candidate.type.name === "highlight");
  return mark ? (attributeColor(mark) ?? "mark") : null;
};

/**
 * Couleur de chaque morceau de texte sélectionné, ou au curseur si rien n'est sélectionné. Deux
 * écritures d'une même couleur (`#c62828` et `#C62828`) ne comptent pas comme un mélange.
 */
function colorAtCursor(state: EditorState, read: ColorReader): ColorAtCursor {
  const { selection } = state;
  if (selection.empty) {
    return { mixed: false, value: read(state.storedMarks ?? selection.$from.marks()) };
  }
  const colors = new Map<string | null, string | null>();
  state.doc.nodesBetween(selection.from, selection.to, (node) => {
    if (!node.isText) return true;
    const color = read(node.marks);
    const key = color?.toLowerCase() ?? null;
    if (!colors.has(key)) colors.set(key, color);
    return true;
  });
  if (colors.size > 1) return { mixed: true };
  const [value = null] = colors.values();
  return { mixed: false, value };
}

/** Couleur du texte sous le curseur, pour le trait sous le « A » (critère 6). */
export function currentTextColor(state: EditorState): ColorAtCursor {
  return colorAtCursor(state, textColorOf);
}

/** Surlignage sous le curseur, pour la pastille sélectionnée de la grille. */
export function currentHighlight(state: EditorState): ColorAtCursor {
  return colorAtCursor(state, highlightOf);
}
