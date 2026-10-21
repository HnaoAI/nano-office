// Mise en page du document (T2.5) : orientation et marges d'une page A4, rangées dans la `Y.Map` « page »
// du Y.Doc et écrites comme attributs du nœud `doc` de `content`. Logique pure, dépend seulement de Yjs.
import type * as Y from "yjs";
import type { DocumentJson } from "./types";

/**
 * Nom de la `Y.Map` qui porte la mise en page.
 * Le fragment Yjs du document ne peut pas porter d'attributs (l'extension de collaboration ignore ceux
 * du nœud `doc`) : la mise en page vit donc à côté, comme les images (T1.9). Elle est ainsi dans
 * `ydoc`, dans la copie de secours et, plus tard, dans la collaboration (T2.5, critère 3).
 * INVARIANT : ce nom et les clés ci-dessous sont écrits dans les fichiers `.nano` et les copies de secours.
 */
export const PAGE_MAP_NAME = "page";

/** Clé de l'orientation, dans la `Y.Map` et dans les attributs du nœud `doc` de `content`. */
export const ORIENTATION_KEY = "pageOrientation";

/** Clé des marges (en centimètres), dans la `Y.Map` et dans les attributs du nœud `doc` de `content`. */
export const MARGINS_KEY = "pageMargins";

/** Origine Yjs d'un changement de mise en page, suivie par l'historique d'annulation (critère 5). */
export const PAGE_SETUP_ORIGIN = "nano-page-setup";

/** Orientation de la page. Portrait par défaut (critère 4). */
export type PageOrientation = "portrait" | "landscape";

/** Marges de la page, en centimètres. */
export interface PageMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Mise en page d'un document : toujours au format A4 (critère 1). */
export interface PageSetup {
  orientation: PageOrientation;
  margins: PageMargins;
}

/** Feuille A4, en centimètres, en portrait. */
export const A4_CM = { width: 21, height: 29.7 } as const;

/** Bornes des marges personnalisées, en centimètres (critère 1). */
export const MIN_MARGIN_CM = 0.5;
export const MAX_MARGIN_CM = 5;

/** Marges proposées, chacune identique sur les quatre côtés (critère 1). Les valeurs sont celles de Word. */
export const MARGIN_PRESETS = [
  { id: "normal", label: "Normales", cm: 2.5 },
  { id: "narrow", label: "Étroites", cm: 1.27 },
  { id: "wide", label: "Larges", cm: 3.5 },
] as const;

/** Choix de marges : un des préréglages, ou des marges personnalisées. */
export type MarginChoice = (typeof MARGIN_PRESETS)[number]["id"] | "custom";

/** Marges identiques sur les quatre côtés. */
export function uniformMargins(cm: number): PageMargins {
  return { top: cm, bottom: cm, left: cm, right: cm };
}

/** Mise en page d'un document sans réglage : marges Normales, en portrait (critère 4). */
export const DEFAULT_PAGE_SETUP: PageSetup = {
  orientation: "portrait",
  margins: uniformMargins(2.5),
};

/** Taille de la feuille, en centimètres, selon l'orientation. */
export function pageSize(orientation: PageOrientation): { width: number; height: number } {
  return orientation === "landscape"
    ? { width: A4_CM.height, height: A4_CM.width }
    : { width: A4_CM.width, height: A4_CM.height };
}

/**
 * Marge lue d'un fichier ou d'un champ, arrondie au centième (1,27 cm reste exact), ou null si ce
 * n'est pas un nombre entre 0,5 et 5 cm.
 */
export function readMargin(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  return rounded >= MIN_MARGIN_CM && rounded <= MAX_MARGIN_CM ? rounded : null;
}

/** Nombre en centimètres écrit à la française (« 1,27 »). */
export function formatCm(value: number): string {
  return String(value).replace(".", ",");
}

/**
 * Lit une marge tapée (« 2,5 » ou « 2.5 »), ou null si elle n'est pas entre 0,5 et 5 cm.
 * Lue dans un champ de texte plutôt que numérique : la virgule française y est toujours acceptée, quelle
 * que soit la langue du navigateur. Deux décimales au plus sont gardées, pour que les marges Étroites
 * (1,27 cm, valeur de Word) restent exactes quand on passe en Personnalisées.
 */
export function parseCm(text: string): number | null {
  const normalized = text.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  return readMargin(Number(normalized));
}

/** Choix de marges correspondant à des marges données : un préréglage si les quatre côtés y sont égaux. */
export function marginChoice(margins: PageMargins): MarginChoice {
  const preset = MARGIN_PRESETS.find(({ cm }) =>
    [margins.top, margins.bottom, margins.left, margins.right].every((side) => side === cm),
  );
  return preset ? preset.id : "custom";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Mise en page décrite par des attributs (ceux du nœud `doc` de `content`, ou le contenu de la
 * `Y.Map`). Une valeur absente ou invalide (fichier modifié à la main) vaut celle par défaut, sans
 * bloquer l'ouverture (critère 6).
 */
export function pageSetupFromAttrs(attrs: unknown): PageSetup {
  const values = isRecord(attrs) ? attrs : {};
  const orientation: PageOrientation =
    values[ORIENTATION_KEY] === "landscape" ? "landscape" : "portrait";
  const raw = isRecord(values[MARGINS_KEY]) ? values[MARGINS_KEY] : {};
  const side = (name: keyof PageMargins) =>
    readMargin(raw[name]) ?? DEFAULT_PAGE_SETUP.margins[name];
  return {
    orientation,
    margins: { top: side("top"), bottom: side("bottom"), left: side("left"), right: side("right") },
  };
}

/**
 * Attributs à écrire pour une mise en page : rien pour une valeur par défaut, pour qu'un document
 * remis en portrait avec les marges Normales soit identique à un document jamais réglé.
 */
export function pageSetupAttrs(setup: PageSetup): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  if (setup.orientation === "landscape") attrs[ORIENTATION_KEY] = "landscape";
  if (marginChoice(setup.margins) !== "normal") attrs[MARGINS_KEY] = { ...setup.margins };
  return attrs;
}

/** `Y.Map` de la mise en page d'un document. */
function pageMap(ydoc: Y.Doc): Y.Map<unknown> {
  return ydoc.getMap(PAGE_MAP_NAME);
}

/** Mise en page d'un Y.Doc (par défaut si rien n'est réglé). */
export function readPageSetup(ydoc: Y.Doc): PageSetup {
  return pageSetupFromAttrs(pageMap(ydoc).toJSON());
}

/**
 * Enregistre une mise en page dans le Y.Doc, en une seule transaction d'origine `PAGE_SETUP_ORIGIN`,
 * annulable en une fois (critère 5). Les marges sont relues : une valeur hors bornes est remplacée par
 * celle par défaut. Une mise en page inchangée n'écrit rien.
 */
export function writePageSetup(ydoc: Y.Doc, setup: PageSetup): void {
  const attrs = pageSetupAttrs(pageSetupFromAttrs(pageSetupAttrs(setup)));
  const map = pageMap(ydoc);
  const current = pageSetupAttrs(readPageSetup(ydoc));
  if (JSON.stringify(current) === JSON.stringify(attrs)) return;
  ydoc.transact(() => {
    for (const key of [ORIENTATION_KEY, MARGINS_KEY]) {
      if (key in attrs) map.set(key, attrs[key]);
      else if (map.has(key)) map.delete(key);
    }
  }, PAGE_SETUP_ORIGIN);
}

/**
 * Document JSON complété par les attributs de mise en page (pour `content`). Le JSON reçu n'est pas
 * modifié ; un document sans réglage reste tel quel, sans `attrs`.
 */
export function withPageSetupAttrs(content: DocumentJson, ydoc: Y.Doc): DocumentJson {
  const attrs = pageSetupAttrs(readPageSetup(ydoc));
  return Object.keys(attrs).length > 0
    ? { ...content, attrs: { ...content.attrs, ...attrs } }
    : content;
}
