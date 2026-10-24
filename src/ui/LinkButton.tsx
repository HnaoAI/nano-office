// Bouton « Lien » de la barre de mise en forme (T2.12) et sa petite fenêtre, au style de la fenêtre « Texte de
// remplacement » (T1.9) : on y tape l'adresse du lien, appliquée au texte sélectionné. Ctrl/Cmd+K l'ouvre aussi,
// comme le bouton « Modifier » de la bulle d'un lien. La logique est dans src/editor/links.ts.
import type { Editor } from "@tiptap/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { linkLabel } from "../core/links";
import { focusEditor } from "../editor/focus";
import { applyLink, currentLink, setLinkRequestHandler } from "../editor/links";
import { LinkIcon } from "./icons";
import { MOD } from "./shortcuts";
import { usePopover } from "./usePopover";

/** Message d'une adresse refusée (critère 2). */
export const LINK_REFUSED_MESSAGE =
  "Adresse refusée : seules les pages web (http, https) et les adresses e-mail sont acceptées.";

/**
 * Bouton « Lien » et sa fenêtre : l'adresse du lien sous le curseur, ou vide ; Entrée ou « Valider » pose le lien,
 * Échap ou un clic à côté ferme sans rien changer. Une adresse refusée laisse la fenêtre ouverte, avec un message.
 * @param editor éditeur à piloter
 * @param active vrai si le curseur est dans un lien (bouton activé, comme l'alignement)
 */
export function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popover = usePopover(rootRef, buttonRef);
  const [value, setValue] = useState("");
  const [refused, setRefused] = useState(false);
  const fromKeyboard = useRef(false);

  const open = (keyboard: boolean) => {
    const link = currentLink(editor.state);
    setValue(link ? linkLabel(link.href) : "");
    setRefused(false);
    fromKeyboard.current = keyboard;
    if (!popover.open) popover.toggle();
  };
  const onRequest = useEffectEvent(() => open(true));

  useEffect(() => {
    setLinkRequestHandler(editor, () => onRequest());
    return () => setLinkRequestHandler(editor, null);
  }, [editor]);

  useEffect(() => {
    if (popover.open) {
      inputRef.current?.select();
    } else if (fromKeyboard.current) {
      // Ouverte au clavier (Ctrl/Cmd+K ou « Modifier ») : le curseur revient dans le texte.
      fromKeyboard.current = false;
      focusEditor(editor);
    }
  }, [popover.open, editor]);

  const apply = () => {
    focusEditor(editor);
    if (applyLink(editor, value) === "refused") {
      setRefused(true);
      inputRef.current?.focus();
      return;
    }
    fromKeyboard.current = false;
    popover.close();
  };

  return (
    <div className="nano-popover-anchor" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="nano-popover-button nano-block-button"
        aria-label="Lien"
        aria-haspopup="true"
        aria-expanded={popover.open}
        aria-pressed={active}
        title={`Lien (${MOD}+K)`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (popover.open ? popover.close() : open(false))}
      >
        <LinkIcon />
      </button>
      {popover.open && (
        <form
          className="nano-popover nano-alt-text nano-link-form"
          aria-label="Lien"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <label className="nano-alt-text-label" htmlFor="nano-link-input">
            Adresse de la page web ou e-mail
          </label>
          <input
            id="nano-link-input"
            ref={inputRef}
            className="nano-alt-text-input"
            type="text"
            inputMode="url"
            value={value}
            spellCheck={false}
            autoComplete="off"
            placeholder="exemple.fr"
            aria-invalid={refused}
            aria-describedby={refused ? "nano-link-refused" : undefined}
            onChange={(event) => {
              setValue(event.target.value);
              setRefused(false);
            }}
          />
          {refused && (
            <p id="nano-link-refused" className="nano-link-refused" role="alert">
              {LINK_REFUSED_MESSAGE}
            </p>
          )}
          <button type="submit" className="nano-alt-text-submit">
            Valider
          </button>
        </form>
      )}
    </div>
  );
}
