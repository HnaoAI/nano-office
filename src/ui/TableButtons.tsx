// Boutons des tableaux de la barre de mise en forme (T1.8) : « Insérer un tableau » et sa grille de
// 8 × 8 cases, puis, quand le curseur est dans un tableau, le groupe des lignes, colonnes et en-tête.
import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { TABLE_GRID_SIZE } from "../core/tableSchema";
import { focusEditor } from "../editor/focus";
import { insertTable } from "../editor/tables";
import {
  ColumnLeftIcon,
  ColumnRightIcon,
  DeleteColumnIcon,
  DeleteRowIcon,
  DeleteTableIcon,
  HeaderRowIcon,
  RowAboveIcon,
  RowBelowIcon,
  TableIcon,
} from "./tableIcons";
import { gridMove, usePopover } from "./usePopover";

/** Taille choisie dans la grille. */
interface GridSize {
  rows: number;
  cols: number;
}

/** « 3 lignes, 4 colonnes », nom accessible d'une case de la grille. */
function sizeLabel({ rows, cols }: GridSize): string {
  const plural = (count: number, word: string) => `${String(count)} ${word}${count > 1 ? "s" : ""}`;
  return `${plural(rows, "ligne")}, ${plural(cols, "colonne")}`;
}

/**
 * Bouton « Insérer un tableau » et sa grille : on choisit la taille au survol ou aux flèches, puis
 * un clic ou Entrée insère le tableau (critère 1). Désactivé dans un tableau (critère 4).
 */
function InsertTableButton({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popover = usePopover(rootRef, buttonRef);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const [size, setSize] = useState<GridSize>({ rows: 1, cols: 1 });
  const count = TABLE_GRID_SIZE * TABLE_GRID_SIZE;

  useEffect(() => {
    if (popover.open) cells.current[0]?.focus();
  }, [popover.open]);

  const choose = (choice: GridSize) => {
    popover.close();
    focusEditor(editor);
    insertTable(editor, choice.rows, choice.cols);
  };

  return (
    <div className="nano-popover-anchor" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="nano-popover-button"
        aria-label="Insérer un tableau"
        aria-haspopup="true"
        aria-expanded={popover.open}
        title="Insérer un tableau"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setSize({ rows: 1, cols: 1 });
          popover.toggle();
        }}
      >
        <TableIcon />
      </button>
      {popover.open && (
        <div className="nano-popover nano-table-picker" role="group" aria-label="Taille du tableau">
          <div className="nano-table-grid">
            {Array.from({ length: count }, (_, index) => {
              const cell = {
                rows: Math.floor(index / TABLE_GRID_SIZE) + 1,
                cols: (index % TABLE_GRID_SIZE) + 1,
              };
              const inside = cell.rows <= size.rows && cell.cols <= size.cols;
              return (
                <button
                  key={index}
                  ref={(element) => {
                    cells.current[index] = element;
                  }}
                  type="button"
                  className={inside ? "nano-table-cell nano-table-cell-on" : "nano-table-cell"}
                  aria-label={sizeLabel(cell)}
                  tabIndex={cell.rows === size.rows && cell.cols === size.cols ? 0 : -1}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setSize(cell)}
                  onFocus={() => setSize(cell)}
                  onKeyDown={(event) => {
                    const next = gridMove(event.key, index, count, TABLE_GRID_SIZE);
                    if (next === null) return;
                    event.preventDefault();
                    cells.current[next]?.focus();
                  }}
                  onClick={() => choose(cell)}
                />
              );
            })}
          </div>
          <div className="nano-table-size" aria-live="polite">
            {`${String(size.rows)} × ${String(size.cols)}`}
          </div>
        </div>
      )}
    </div>
  );
}

/** Boutons du groupe « Tableau », dans l'ordre du critère 2. */
const TABLE_ACTIONS: {
  label: string;
  icon: React.ReactNode;
  run: (editor: Editor) => boolean;
  /** Suppression soumise à condition : la dernière ligne ou colonne ne se supprime pas seule. */
  needs?: "row" | "column";
}[] = [
  {
    label: "Ajouter une ligne au-dessus",
    icon: <RowAboveIcon />,
    run: (e) => e.commands.addRowBefore(),
  },
  {
    label: "Ajouter une ligne au-dessous",
    icon: <RowBelowIcon />,
    run: (e) => e.commands.addRowAfter(),
  },
  {
    label: "Ajouter une colonne à gauche",
    icon: <ColumnLeftIcon />,
    run: (e) => e.commands.addColumnBefore(),
  },
  {
    label: "Ajouter une colonne à droite",
    icon: <ColumnRightIcon />,
    run: (e) => e.commands.addColumnAfter(),
  },
  {
    label: "Supprimer la ligne",
    icon: <DeleteRowIcon />,
    run: (e) => e.commands.deleteRow(),
    needs: "row",
  },
  {
    label: "Supprimer la colonne",
    icon: <DeleteColumnIcon />,
    run: (e) => e.commands.deleteColumn(),
    needs: "column",
  },
  {
    label: "Supprimer le tableau",
    icon: <DeleteTableIcon />,
    run: (e) => e.commands.deleteTable(),
  },
];

/**
 * Bouton « Insérer un tableau », puis le groupe « Tableau » quand le curseur est dans un tableau
 * (critère 2) : il disparaît quand le curseur en sort.
 * INVARIANT : chaque bouton garde son nom accessible, même s'il n'affiche qu'une icône.
 * @param editor éditeur à piloter
 * @param inTable vrai si le curseur est dans un tableau
 * @param headerRow vrai si la première ligne du tableau du curseur est une ligne d'en-tête
 * @param canDelete faux pour la seule ligne ou la seule colonne d'un tableau : le bouton est désactivé
 *   (« Supprimer le tableau » reste possible)
 */
export function TableButtons({
  editor,
  inTable,
  headerRow,
  canDelete,
}: {
  editor: Editor;
  inTable: boolean;
  headerRow: boolean;
  canDelete: { row: boolean; column: boolean };
}) {
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();
  return (
    <>
      <InsertTableButton editor={editor} disabled={inTable} />
      {inTable && (
        <div className="nano-table-actions" role="group" aria-label="Tableau">
          {TABLE_ACTIONS.map(({ label, icon, run, needs }) => (
            <button
              key={label}
              type="button"
              disabled={needs !== undefined && !canDelete[needs]}
              aria-label={label}
              title={label}
              onMouseDown={keepFocus}
              onClick={() => {
                focusEditor(editor);
                run(editor);
              }}
            >
              {icon}
            </button>
          ))}
          <button
            type="button"
            className="nano-block-button"
            aria-label="Ligne d'en-tête"
            aria-pressed={headerRow}
            title="Ligne d'en-tête"
            onMouseDown={keepFocus}
            onClick={() => {
              focusEditor(editor);
              editor.commands.toggleHeaderRow();
            }}
          >
            <HeaderRowIcon />
          </button>
        </div>
      )}
    </>
  );
}
