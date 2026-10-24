// Bulle d'un lien (T2.12, critère 3) : au survol d'un lien ou quand le curseur y est, elle montre l'adresse avec
// « Modifier », « Retirer le lien » et « Ouvrir ». Posée sous le lien, hors du document ; jamais imprimée.
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { linkLabel } from "../core/links";
import { focusEditor } from "../editor/focus";
import {
  currentLink,
  linkAt,
  openLink,
  removeLink,
  requestLinkEditing,
  type DocumentLinkRange,
} from "../editor/links";

/** Délai avant de cacher la bulle quand la souris quitte le lien, pour pouvoir l'atteindre. */
const HIDE_DELAY_MS = 300;

/** Position de la bulle dans la fenêtre : sous le lien, alignée sur son début. */
function bubblePosition(editor: Editor, link: DocumentLinkRange): { top: number; left: number } {
  const start = editor.view.coordsAtPos(link.from, 1);
  const end = editor.view.coordsAtPos(link.to, -1);
  return { top: Math.max(start.bottom, end.bottom) + 6, left: start.left };
}

/**
 * Bulle du lien survolé, ou à défaut du lien sous le curseur quand l'éditeur a le focus.
 * @param editor éditeur affiché
 */
export function LinkBubble({ editor }: { editor: Editor }) {
  const cursorLink = useEditorState({
    editor,
    selector: ({ editor: current }) => (current.isFocused ? currentLink(current.state) : null),
  });
  const [hovered, setHovered] = useState<DocumentLinkRange | null>(null);
  const [, setScroll] = useState(0);
  const hideTimer = useRef(0);

  useEffect(() => {
    const dom = editor.view.dom;
    const onOver = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!anchor || !dom.contains(anchor)) return;
      window.clearTimeout(hideTimer.current);
      const link = linkAt(editor.state, editor.view.posAtDOM(anchor, 0));
      setHovered(link);
    };
    const onOut = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!anchor) return;
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setHovered(null), HIDE_DELAY_MS);
    };
    const onScroll = () => setScroll((value) => value + 1);
    dom.addEventListener("mouseover", onOver);
    dom.addEventListener("mouseout", onOut);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(hideTimer.current);
      dom.removeEventListener("mouseover", onOver);
      dom.removeEventListener("mouseout", onOut);
      window.removeEventListener("scroll", onScroll);
    };
  }, [editor]);

  // Un lien survolé qui n'existe plus (texte modifié) n'a plus de bulle.
  const live =
    hovered && linkAt(editor.state, hovered.from + 1)?.href === hovered.href ? hovered : null;
  const link = live ?? cursorLink;
  if (!link || editor.isDestroyed) return null;
  const { top, left } = bubblePosition(editor, link);
  const keep = (event: React.MouseEvent) => event.preventDefault();

  return (
    <div
      className="nano-link-bubble"
      role="group"
      aria-label="Lien"
      style={{ top, left }}
      onMouseEnter={() => window.clearTimeout(hideTimer.current)}
      onMouseLeave={() => {
        hideTimer.current = window.setTimeout(() => setHovered(null), HIDE_DELAY_MS);
      }}
    >
      <span className="nano-link-bubble-address" title={link.href}>
        {linkLabel(link.href)}
      </span>
      <button
        type="button"
        onMouseDown={keep}
        onClick={() => {
          focusEditor(editor);
          // Tout le lien sélectionné : « Valider » change l'adresse de tout le lien.
          editor.commands.setTextSelection({ from: link.from, to: link.to });
          setHovered(null);
          requestLinkEditing(editor);
        }}
      >
        Modifier
      </button>
      <button
        type="button"
        onMouseDown={keep}
        onClick={() => {
          focusEditor(editor);
          removeLink(editor, link);
          setHovered(null);
        }}
      >
        Retirer le lien
      </button>
      <button type="button" onMouseDown={keep} onClick={() => openLink(link.href)}>
        Ouvrir
      </button>
    </div>
  );
}
