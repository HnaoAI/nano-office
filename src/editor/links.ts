// Liens dans l'éditeur (T2.12) : poser, modifier et retirer un lien en une étape d'annulation, lien sous le
// curseur, ouverture par Ctrl/Cmd+clic dans un nouvel onglet, et demande d'ouverture de la petite fenêtre
// « Lien » par Ctrl/Cmd+K. La marque et les adresses acceptées sont dans src/core/links.ts.
import { Extension, getMarkRange, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { isAllowedLinkUrl, linkLabel, normalizeLinkInput } from "../core/links";
import { isMacPlatform } from "./platform";

/** Un lien du document : son adresse et sa plage. */
export interface DocumentLinkRange {
  href: string;
  from: number;
  to: number;
}

/** Lien qui contient la position `pos`, ou null. */
export function linkAt(state: EditorState, pos: number): DocumentLinkRange | null {
  const type = state.schema.marks.link;
  if (!type) return null;
  const $pos = state.doc.resolve(pos);
  const mark =
    $pos.marks().find((candidate) => candidate.type === type) ??
    $pos.nodeAfter?.marks.find((candidate) => candidate.type === type);
  if (!mark || !isAllowedLinkUrl(mark.attrs.href)) return null;
  const range =
    getMarkRange($pos, type, mark.attrs) ??
    getMarkRange(state.doc.resolve(pos + 1), type, mark.attrs);
  return range ? { href: mark.attrs.href, from: range.from, to: range.to } : null;
}

/** Lien sous le curseur, ou qui contient toute la sélection ; null sinon. */
export function currentLink(state: EditorState): DocumentLinkRange | null {
  const { from, to, empty } = state.selection;
  const link = linkAt(state, from);
  if (!link) return null;
  return empty || (from >= link.from && to <= link.to) ? link : null;
}

/** Résultat de « Appliquer » dans la fenêtre « Lien ». */
export type LinkResult = "linked" | "refused";

/**
 * Pose le lien saisi (critère 1), en une étape d'annulation :
 * - sur le texte sélectionné ;
 * - curseur dans un lien : change son adresse ;
 * - sans sélection : insère l'adresse tapée comme texte du lien (sans `mailto:`).
 * @returns "refused" si l'adresse n'est pas acceptée (critère 2) : rien ne change
 */
export function applyLink(editor: Editor, input: string): LinkResult {
  const href = normalizeLinkInput(input);
  if (href === null) return "refused";
  const { state } = editor;
  const existing = currentLink(state);
  if (state.selection.empty && existing) {
    editor
      .chain()
      .setTextSelection({ from: existing.from, to: existing.to })
      .setLink({ href })
      .setTextSelection(existing.to)
      .run();
  } else if (state.selection.empty) {
    const text = linkLabel(href.startsWith("mailto:") ? href : input.trim());
    editor
      .chain()
      .insertContent({ type: "text", text, marks: [{ type: "link", attrs: { href } }] })
      .unsetMark("link")
      .run();
  } else {
    editor.chain().setLink({ href }).run();
  }
  return "linked";
}

/** « Retirer le lien » : le texte reste, sans son lien, en une étape d'annulation (critère 3). */
export function removeLink(
  editor: Editor,
  link: DocumentLinkRange | null = currentLink(editor.state),
): boolean {
  if (!link) return false;
  const type = editor.schema.marks.link;
  if (!type) return false;
  editor.view.dispatch(editor.state.tr.removeMark(link.from, link.to, type));
  return true;
}

/**
 * Ouvre une adresse dans un nouvel onglet, sans lien avec la page (`noopener`, critère 3). C'est le navigateur qui
 * fait la requête, à la demande de l'utilisateur : Nano Buro n'envoie rien lui-même (critère 6).
 * @returns faux pour une adresse refusée, qui n'est jamais ouverte
 */
export function openLink(href: string): boolean {
  if (!isAllowedLinkUrl(href)) return false;
  window.open(href, "_blank", "noopener,noreferrer");
  return true;
}

/** Ouverture de la fenêtre « Lien » de chaque éditeur, posée par le bouton de la barre (src/ui/LinkButton.tsx). */
const linkRequests = new WeakMap<Editor, () => void>();

/** Enregistre ce qui ouvre la fenêtre « Lien » pour cet éditeur ; null l'enlève. */
export function setLinkRequestHandler(editor: Editor, handler: (() => void) | null): void {
  if (handler) linkRequests.set(editor, handler);
  else linkRequests.delete(editor);
}

/** Ctrl/Cmd+K (critère 1) : ouvre la fenêtre « Lien ». Vrai si elle a pu être ouverte. */
export function requestLinkEditing(editor: Editor): boolean {
  const handler = linkRequests.get(editor);
  if (!handler) return false;
  handler();
  return true;
}

/** Vrai pour un clic avec Cmd (Mac) ou Ctrl (ailleurs), sans autre touche. */
function isOpenClick(event: MouseEvent, mac: boolean): boolean {
  return event.button === 0 && (mac ? event.metaKey : event.ctrlKey) && !event.altKey;
}

/**
 * Ctrl/Cmd+clic sur un lien l'ouvre dans un nouvel onglet ; un clic simple place le curseur, comme ailleurs
 * (critère 3).
 */
export function createLinkClickPlugin(): Plugin {
  const mac = isMacPlatform();
  return new Plugin({
    key: new PluginKey("linkClick"),
    props: {
      handleClick(view: EditorView, pos: number, event: MouseEvent) {
        if (!isOpenClick(event, mac)) return false;
        const link = linkAt(view.state, pos);
        if (!link) return false;
        openLink(link.href);
        return true;
      },
    },
  });
}

/** Extension qui installe `createLinkClickPlugin`. */
export const LinkClick = Extension.create({
  name: "linkClick",
  addProseMirrorPlugins() {
    return [createLinkClickPlugin()];
  },
});
