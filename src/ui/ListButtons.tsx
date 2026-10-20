// Boutons « Liste à puces » et « Liste numérotée » de la barre de mise en forme (T1.2),
// avec les icônes de la maquette. Activés quand le curseur est dans une liste du même type.
import type { Editor } from "@tiptap/react";
import { focusEditor } from "../editor/focus";
import { toggleList, type ListType } from "../editor/lists";
import { BulletListIcon, OrderedListIcon } from "./icons";
import { MOD } from "./shortcuts";

const BUTTONS: { type: ListType; label: string; key: string; icon: React.ReactNode }[] = [
  { type: "bulletList", label: "Liste à puces", key: "8", icon: <BulletListIcon /> },
  { type: "orderedList", label: "Liste numérotée", key: "7", icon: <OrderedListIcon /> },
];

/**
 * Les deux boutons de listes.
 * @param editor éditeur à piloter
 * @param active type de la liste du curseur, ou null hors d'une liste
 */
export function ListButtons({ editor, active }: { editor: Editor; active: ListType | null }) {
  return BUTTONS.map(({ type, label, key, icon }) => (
    <button
      key={type}
      type="button"
      className="nano-block-button"
      aria-label={label}
      aria-pressed={active === type}
      title={`${label} (${MOD}+Shift+${key})`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        focusEditor(editor);
        toggleList(editor, type);
      }}
    >
      {icon}
    </button>
  ));
}
