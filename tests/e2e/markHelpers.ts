// Outil commun aux tests d'interface des marques du lot I (T2.10, T2.12, T2.13) : marques d'un texte relu.

/** Marques, triées, du morceau de texte `text` dans un contenu JSON relu. */
export function marksIn(json: unknown, text: string): string[] {
  const found: string[][] = [];
  const walk = (node: unknown) => {
    if (typeof node !== "object" || node === null) return;
    const value = node as { text?: string; marks?: { type: string }[]; content?: unknown[] };
    if (value.text === text) found.push((value.marks ?? []).map((mark) => mark.type).sort());
    value.content?.forEach(walk);
  };
  walk(json);
  if (found.length === 0) throw new Error(`texte absent : ${text}`);
  return found[0] ?? [];
}
