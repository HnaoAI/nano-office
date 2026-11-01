// Nœud « schéma » du document (T2.20), partagé par le format de fichier et l'éditeur. Sans accès au
// navigateur : l'affichage et la modification sont dans src/editor/diagram.ts et src/ui/diagram/.
import { Node } from "@tiptap/core";
import { chosenHeight, diagramDescription, readDiagram } from "./diagram";

/** Nom du nœud dans le document (JSON de Tiptap, fichier `.nano`, Y.Doc). */
export const DIAGRAM_NODE = "diagram";

/**
 * Groupe propre aux schémas, à la place du groupe « block ».
 * INVARIANT : une cellule (`block+`), un élément de liste et un encadré n'acceptent pas ce groupe : un
 * schéma se place toujours entre deux blocs du document, comme une image ou un sommaire. Seul le
 * document l'accepte (tableSchema.ts).
 */
export const DIAGRAM_GROUP = "documentDiagram";

/** Attribut HTML qui reconnaît un schéma de Nano Buro, dans un collage interne. */
export const DIAGRAM_ATTRIBUTE = "data-diagram";

/** Attribut HTML qui porte les formes et les flèches, en JSON, dans un collage interne. */
const DATA_ATTRIBUTE = "data-diagram-content";

/**
 * Schéma (critère 7) : un bloc sans texte (atome) qui porte son identifiant de bloc (`id`, par
 * l'extension du schéma) et ses données en attributs : `shapes` (identifiant, type, position, taille,
 * texte, fond), `arrows` (identifiant, extrémités, côtés, texte) et `height`, la hauteur choisie à la
 * poignée du bas (null : la hauteur suit le contenu). Les attributs sont relus par `readDiagram`, sans
 * confiance. Nouveau type de contenu, sans changement de version du format, comme le sommaire (T2.17).
 * Ses textes ne sont pas du texte du document : ils ne comptent pas dans les mots (critère 10).
 */
export const DiagramNode = Node.create({
  name: DIAGRAM_NODE,
  group: DIAGRAM_GROUP,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      shapes: {
        default: [],
        parseHTML: (element) => readJson(element).shapes,
        renderHTML: () => ({}),
      },
      arrows: {
        default: [],
        parseHTML: (element) => readJson(element).arrows,
        renderHTML: () => ({}),
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const height = element.getAttribute("data-height");
          return height === null ? null : chosenHeight(Number(height));
        },
        renderHTML: (attributes) => {
          const height = chosenHeight(attributes.height);
          return height === null ? {} : { "data-height": String(height) };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[${DIAGRAM_ATTRIBUTE}]` }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const data = readDiagram(node.attrs);
    return [
      "div",
      {
        ...HTMLAttributes,
        [DIAGRAM_ATTRIBUTE]: "",
        [DATA_ATTRIBUTE]: JSON.stringify(data),
        class: "nano-diagram",
        role: "img",
        "aria-label": diagramDescription(data),
      },
    ];
  },
});

function readJson(element: HTMLElement): ReturnType<typeof readDiagram> {
  try {
    const parsed: unknown = JSON.parse(element.getAttribute(DATA_ATTRIBUTE) ?? "{}");
    return readDiagram(
      typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {},
    );
  } catch {
    return readDiagram({});
  }
}
