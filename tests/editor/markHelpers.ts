// Outil commun aux tests des marques du lot I (T2.10, T2.12, T2.13) : marques d'un morceau de texte.
import type { Editor } from "@tiptap/core";

/** Noms des marques, triés, du morceau de texte qui contient `fragment`. */
export function marksOf(target: Editor, fragment: string): string[] {
  let found: string[] | null = null;
  target.state.doc.descendants((node) => {
    if (found === null && node.isText && node.text?.includes(fragment)) {
      found = node.marks.map((mark) => mark.type.name).sort();
    }
    return true;
  });
  if (!found) throw new Error(`texte absent : ${fragment}`);
  return found;
}
