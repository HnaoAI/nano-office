// Fenêtre « Mes fautes » (T2.23, critères 9 à 15), au style de la boîte « Réglages » (dialog.css) :
// total et date de début, Pareto en SVG (barres et courbe du cumul, ligne à 80 %), son équivalent en
// tableau pour les lecteurs d'écran, règle et 3 derniers exemples des types en noir, « Remettre à zéro ».
// Le calcul est dans core/mistakes.ts ; rien ne part sur le réseau ni dans un fichier.
import { useEffect, useId, useState } from "react";
import {
  MISTAKE_RULES,
  PARETO_THRESHOLD,
  paretoRows,
  totalMistakes,
  type MistakeExample,
  type MistakeStats,
  type ParetoRow,
} from "../core/mistakes";
import { ChartIcon } from "./icons";
import { NO_MISTAKES_TEXT, sinceText } from "./mistakesTexts";

const percentFormat = new Intl.NumberFormat("fr-FR", { style: "percent" });

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count > 1 ? "s" : ""}`;
}

/** Côté vide d'un exemple (un mot ajouté ou retiré). */
function side(text: string): string {
  return text === "" ? "(rien)" : `« ${text} »`;
}

// Dimensions du graphique, en unités du viewBox ; il s'adapte ensuite à la largeur de la fenêtre.
const WIDTH = 520;
const HEIGHT = 230;
const LEFT = 8;
const RIGHT = 40;
const TOP = 22;
const BOTTOM = 48;
const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
const PLOT_HEIGHT = HEIGHT - TOP - BOTTOM;

/** Nom d'un type sur deux lignes au plus, pour tenir sous sa barre. */
function labelLines(label: string): string[] {
  const words = label.split(" ");
  if (words.length < 2) return [label];
  return [words[0] ?? "", words.slice(1).join(" ")];
}

/**
 * Pareto : une barre par type, haute de sa part du total, et la courbe du cumul sur la même échelle,
 * avec une ligne à 80 %. Noir pour les types des premiers 80 %, gris pour les autres (critère 10).
 * Caché aux lecteurs d'écran, qui lisent le tableau équivalent (critère 15).
 */
function ParetoChart({ rows }: { rows: ParetoRow[] }) {
  const slot = PLOT_WIDTH / rows.length;
  const barWidth = Math.min(44, slot * 0.6);
  const y = (share: number) => TOP + PLOT_HEIGHT * (1 - share);
  const centers = rows.map((_, index) => LEFT + slot * (index + 0.5));
  const curve = rows
    .map((row, index) => `${(centers[index] ?? 0).toFixed(1)},${y(row.cumulative).toFixed(1)}`)
    .join(" ");
  const threshold = y(PARETO_THRESHOLD);
  return (
    <svg
      className="nano-pareto"
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      aria-hidden="true"
      focusable="false"
    >
      <line className="nano-pareto-axis" x1={LEFT} x2={LEFT + PLOT_WIDTH} y1={y(0)} y2={y(0)} />
      <line
        className="nano-pareto-threshold"
        x1={LEFT}
        x2={LEFT + PLOT_WIDTH}
        y1={threshold}
        y2={threshold}
      />
      <text className="nano-pareto-scale" x={WIDTH - 2} y={threshold + 4} textAnchor="end">
        80 %
      </text>
      <text className="nano-pareto-scale" x={WIDTH - 2} y={y(1) + 4} textAnchor="end">
        100 %
      </text>
      {rows.map((row, index) => {
        const center = centers[index] ?? 0;
        const top = y(row.share);
        return (
          <g key={row.type} className={row.vital ? "nano-pareto-vital" : "nano-pareto-other"}>
            <rect
              className="nano-pareto-bar"
              data-type={row.type}
              x={center - barWidth / 2}
              y={top}
              width={barWidth}
              height={y(0) - top}
            />
            <text className="nano-pareto-count" x={center} y={top - 6} textAnchor="middle">
              {row.count}
            </text>
            <text className="nano-pareto-label" x={center} y={y(0) + 16} textAnchor="middle">
              {labelLines(row.label).map((line, lineIndex) => (
                <tspan key={line} x={center} dy={lineIndex === 0 ? 0 : 13}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
      <polyline className="nano-pareto-curve" points={curve} />
      {rows.map((row, index) => (
        <circle
          key={row.type}
          className="nano-pareto-point"
          cx={centers[index]}
          cy={y(row.cumulative)}
          r={3.5}
        />
      ))}
    </svg>
  );
}

function Examples({ examples }: { examples: MistakeExample[] }) {
  if (examples.length === 0) return null;
  return (
    <ul className="nano-mistakes-examples" aria-label="Derniers exemples">
      {examples.map((example, index) => (
        <li key={index}>
          {side(example.before)} → {side(example.after)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Fenêtre « Mes fautes ».
 * @param stats statistiques de cet ordinateur
 * @param onReset efface les nombres et les exemples, après confirmation (critère 14)
 * @param onClose ferme la fenêtre (« Fermer », Échap, clic à côté ; critère 9)
 */
export function MistakesDialog({
  stats,
  onReset,
  onClose,
}: {
  stats: MistakeStats;
  onReset: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      // Pendant la confirmation, Échap revient en arrière sans rien effacer.
      if (confirming) setConfirming(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, confirming]);

  const rows = paretoRows(stats);
  const total = totalMistakes(stats);
  return (
    <div className="nano-dialog-layer">
      <div className="nano-dialog-backdrop" aria-hidden="true" onClick={onClose} />
      <div
        className="nano-dialog nano-mistakes"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
      >
        <span className="nano-dialog-icon" aria-hidden="true">
          <ChartIcon size={22} />
        </span>
        <div className="nano-dialog-text">
          <h2 id={`${id}-title`}>Mes fautes</h2>
          <p>
            {total === 0
              ? NO_MISTAKES_TEXT
              : `${plural(total, "faute")} ${total > 1 ? "comptées" : "comptée"} depuis le ${sinceText(stats.since)}.`}{" "}
            Ces statistiques restent sur cet ordinateur.
          </p>
        </div>
        {rows.length > 0 && (
          <>
            <figure className="nano-mistakes-chart">
              <ParetoChart rows={rows} />
              <table className="nano-visually-hidden">
                <caption>Fautes par type, de la plus fréquente à la plus rare</caption>
                <thead>
                  <tr>
                    <th scope="col">Type</th>
                    <th scope="col">Nombre</th>
                    <th scope="col">Pourcentage cumulé</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.type}>
                      <th scope="row">{row.label}</th>
                      <td>{row.count}</td>
                      <td>{percentFormat.format(row.cumulative)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </figure>
            <div className="nano-mistakes-rules">
              <h3>À retenir en premier</h3>
              {rows
                .filter((row) => row.vital)
                .map((row) => (
                  <section key={row.type} aria-label={row.label}>
                    <h4>
                      {row.label} <small>{plural(row.count, "faute")}</small>
                    </h4>
                    <p>{MISTAKE_RULES[row.type]}</p>
                    <Examples examples={stats.types[row.type]?.examples ?? []} />
                  </section>
                ))}
            </div>
          </>
        )}
        {confirming ? (
          <div className="nano-dialog-buttons" role="group" aria-label="Confirmer la remise à zéro">
            <p className="nano-mistakes-confirm">Effacer toutes les fautes comptées ?</p>
            <button
              type="button"
              className="nano-dialog-primary"
              onClick={() => {
                onReset();
                setConfirming(false);
              }}
            >
              Effacer
            </button>
            <button type="button" onClick={() => setConfirming(false)} autoFocus>
              Garder
            </button>
          </div>
        ) : (
          <div className="nano-dialog-buttons">
            <button type="button" className="nano-dialog-primary" onClick={onClose} autoFocus>
              Fermer
            </button>
            {total > 0 && (
              <button type="button" onClick={() => setConfirming(true)}>
                Remettre à zéro
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
