// Boutons des images de la barre de mise en forme (T1.9) : « Insérer une image », qui ouvre le
// sélecteur de fichiers, puis, quand une image est sélectionnée, le groupe « Image » et son
// « Texte de remplacement », modifiable dans une petite fenêtre.
import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { IMAGE_TYPES } from "../core/images";
import { focusEditor } from "../editor/focus";
import { insertImagesFromPicker, setImageAlt } from "../editor/images";
import { AltTextIcon, ImageIcon } from "./icons";
import { usePopover } from "./usePopover";

/**
 * « Texte de remplacement » de l'image sélectionnée (critère 5) : la fenêtre s'ouvre avec le texte
 * actuel ; Entrée ou « Valider » l'enregistre, Échap ou un clic à côté ferme sans rien changer.
 */
function AltTextButton({ editor, alt }: { editor: Editor; alt: string }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popover = usePopover(rootRef, buttonRef);
  const [value, setValue] = useState(alt);

  useEffect(() => {
    if (popover.open) inputRef.current?.select();
  }, [popover.open]);

  const apply = () => {
    popover.close();
    focusEditor(editor);
    setImageAlt(editor, value);
  };

  return (
    <div className="nano-popover-anchor" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="nano-popover-button"
        aria-label="Texte de remplacement"
        aria-haspopup="true"
        aria-expanded={popover.open}
        title="Texte de remplacement"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setValue(alt);
          popover.toggle();
        }}
      >
        <AltTextIcon />
      </button>
      {popover.open && (
        <form
          className="nano-popover nano-alt-text"
          aria-label="Texte de remplacement"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <label className="nano-alt-text-label" htmlFor="nano-alt-text-input">
            Texte de remplacement
          </label>
          <input
            id="nano-alt-text-input"
            ref={inputRef}
            className="nano-alt-text-input"
            type="text"
            value={value}
            spellCheck
            lang="fr"
            onChange={(event) => setValue(event.target.value)}
          />
          <button type="submit" className="nano-alt-text-submit">
            Valider
          </button>
        </form>
      )}
    </div>
  );
}

/**
 * Bouton « Insérer une image » et, pour une image sélectionnée, le groupe « Image ».
 * INVARIANT : chaque bouton garde son nom accessible, même s'il n'affiche qu'une icône.
 * @param editor éditeur à piloter
 * @param selectedAlt texte de remplacement de l'image sélectionnée, ou null sans image sélectionnée
 */
export function ImageButtons({
  editor,
  selectedAlt,
}: {
  editor: Editor;
  selectedAlt: string | null;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <button
        type="button"
        aria-label="Insérer une image"
        title="Insérer une image"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => inputRef.current?.click()}
      >
        <ImageIcon />
      </button>
      <input
        ref={inputRef}
        type="file"
        className="nano-hidden-input"
        accept={IMAGE_TYPES.join(",")}
        multiple
        tabIndex={-1}
        aria-hidden="true"
        data-testid="image-input"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Vidé tout de suite, pour pouvoir choisir deux fois de suite le même fichier.
          event.target.value = "";
          focusEditor(editor);
          if (files.length > 0) void insertImagesFromPicker(editor, files);
        }}
      />
      {selectedAlt !== null && (
        <div className="nano-table-actions" role="group" aria-label="Image">
          <AltTextButton editor={editor} alt={selectedAlt} />
        </div>
      )}
    </>
  );
}
