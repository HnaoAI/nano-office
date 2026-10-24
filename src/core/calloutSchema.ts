// Encadré du document (T2.19), partagé par le format de fichier et l'éditeur : un bloc qui contient des paragraphes,
// des titres, des listes et des images, avec l'un des trois styles de la charte. Sans accès au navigateur : les
// commandes (encadrer, retirer, sortir avec Entrée) sont dans src/editor/callout.ts.
import { Node } from "@tiptap/core";
import { IMAGE_GROUP } from "./imageSchema";

/** Nom du nœud dans le document (JSON de Tiptap, fichier `.nano`, Y.Doc). */
export const CALLOUT_NODE = "callout";

/**
 * Groupe propre aux encadrés, à la place du groupe « block ».
 * INVARIANT : un encadré n'accepte que le groupe « block » (paragraphes, titres, listes) et les images ; il ne fait
 * lui-même pas partie du groupe « block », donc il ne peut contenir ni tableau, ni autre encadré, ni saut de page,
 * et ne peut pas être placé dans une liste ou une cellule (critère 3). Seul le document l'accepte (tableSchema.ts).
 */
export const CALLOUT_GROUP = "documentCallout";

/**
 * Styles proposés (critère 2) : cadre fin, cadre fin avec fond gris clair, fond gris clair sans cadre.
 * INVARIANT : ces valeurs sont écrites dans les fichiers `.nano` ; les changer rendrait le style des encadrés
 * existants inconnu (il serait alors affiché en cadre fin).
 */
export const CALLOUT_STYLES = [
  { value: "border", label: "Cadre fin" },
  { value: "border-shaded", label: "Cadre et fond gris" },
  { value: "shaded", label: "Fond gris" },
] as const;

/** Style d'un encadré. */
export type CalloutStyle = (typeof CALLOUT_STYLES)[number]["value"];

/** Style valide lu dans un attribut ou un fichier : un style inconnu devient le cadre fin. */
export function calloutStyle(value: unknown): CalloutStyle {
  return CALLOUT_STYLES.some((style) => style.value === value) ? (value as CalloutStyle) : "border";
}

/**
 * Encadré (critères 1 à 4) : un bloc qui contient des paragraphes, et non une forme posée sur le texte. Il porte son
 * identifiant de bloc (`id`, par l'extension du schéma, règle produit 5) et son style. Nouveau type de contenu, sans
 * changement de version du format, comme au lot A (critère 6).
 * Rendu HTML : `<div data-callout="border">`, relu seulement depuis ce marqueur : un collage extérieur garde le
 * texte, et src/editor/clipboard.ts retire le cadre (critère 5).
 */
export const CalloutNode = Node.create({
  name: CALLOUT_NODE,
  group: CALLOUT_GROUP,
  content: `(block | ${IMAGE_GROUP})+`,

  addAttributes() {
    return {
      calloutStyle: {
        default: "border",
        parseHTML: (element) => calloutStyle(element.getAttribute("data-callout")),
        renderHTML: (attributes) => ({ "data-callout": calloutStyle(attributes.calloutStyle) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, class: "nano-callout" }, 0];
  },
});
