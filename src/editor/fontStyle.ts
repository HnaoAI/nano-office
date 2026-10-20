// Police et taille du texte dans l'éditeur (T1.4) : application à la sélection ou au texte tapé
// ensuite, et lecture de la police et de la taille au niveau du curseur.
import type { Editor } from "@tiptap/core";
import type { Mark } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { DEFAULT_FONT, DEFAULT_FONT_SIZE, fontSizePoints, fontSizeValue } from "../core/textStyle";

/**
 * Applique une police à la sélection, ou au texte tapé ensuite si rien n'est sélectionné
 * (T1.4, critère 3), en une seule étape d'annulation. La police par défaut retire l'attribut.
 */
export function setFontFamily(editor: Editor, name: string): boolean {
  return editor
    .chain()
    .setMark("textStyle", { fontFamily: name === DEFAULT_FONT ? null : name })
    .removeEmptyTextStyle()
    .run();
}

/**
 * Applique une taille, en points, à la sélection ou au texte tapé ensuite. La taille est toujours
 * écrite, même 12 : dans un titre, l'absence de taille vaut la taille du titre, pas 12.
 */
export function setFontSize(editor: Editor, points: number): boolean {
  return editor
    .chain()
    .setMark("textStyle", { fontSize: fontSizeValue(points) })
    .run();
}

/** Police et taille d'un morceau de texte ; `size` est null dans un titre sans taille choisie. */
interface TextStyleAt {
  font: string;
  size: number | null;
}

function styleOf(marks: readonly Mark[], inHeading: boolean): TextStyleAt {
  const attrs = marks.find((mark) => mark.type.name === "textStyle")?.attrs ?? {};
  const font: unknown = attrs.fontFamily;
  const size = fontSizePoints(attrs.fontSize);
  return {
    font: typeof font === "string" && font !== "" ? font : DEFAULT_FONT,
    size: size ?? (inHeading ? null : DEFAULT_FONT_SIZE),
  };
}

/** Police et taille de chaque morceau de texte sélectionné, ou au curseur si rien n'est sélectionné. */
function selectedStyles(state: EditorState): TextStyleAt[] {
  const { selection } = state;
  if (selection.empty) {
    const { $from } = selection;
    return [styleOf(state.storedMarks ?? $from.marks(), $from.parent.type.name === "heading")];
  }
  const styles: TextStyleAt[] = [];
  state.doc.nodesBetween(selection.from, selection.to, (node, _pos, parent) => {
    if (node.isText) styles.push(styleOf(node.marks, parent?.type.name === "heading"));
    return true;
  });
  return styles;
}

/**
 * Police et taille au niveau du curseur, pour les listes déroulantes (T1.4, critère 4). Chaque
 * valeur est null si la sélection en mélange plusieurs ; la taille est aussi null dans un titre
 * sans taille choisie.
 */
export function currentTextStyle(state: EditorState): { font: string | null; size: number | null } {
  const styles = selectedStyles(state);
  const fonts = new Set(styles.map((style) => style.font));
  const sizes = new Set(styles.map((style) => style.size));
  const [font] = fonts;
  const [size] = sizes;
  return {
    font: fonts.size === 1 && font !== undefined ? font : null,
    size: sizes.size === 1 && size !== undefined ? size : null,
  };
}
