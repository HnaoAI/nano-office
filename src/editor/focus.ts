// Remet le curseur dans l'éditeur après un clic sur la barre de mise en forme (lot A).
import type { Editor } from "@tiptap/core";

/**
 * Redonne le focus à l'éditeur, tout de suite, sans changer la sélection.
 * `editor.commands.focus()` de Tiptap attend l'image suivante (requestAnimationFrame) et peut alors
 * remettre une sélection périmée si l'utilisateur a déjà déplacé le curseur au clavier.
 * Les boutons gardent le focus dans l'éditeur (mousedown annulé) : seules les listes déroulantes
 * le prennent vraiment.
 */
export function focusEditor(editor: Editor): void {
  if (!editor.view.hasFocus()) editor.view.focus();
}
