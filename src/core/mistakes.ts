// Mes fautes (T2.23) : types de faute des corrections de l'assistant, règle courte de chaque type,
// compte des corrections acceptées avec leurs 3 derniers exemples, et calcul du Pareto.
// Logique pure : le rangement sur l'ordinateur est dans src/storage/mistakeStatsStore.ts.
// INVARIANT : ces statistiques ne vont jamais dans un fichier `.nano`, l'export Word ni le réseau (critère 7).

/** Types de faute, dans l'ordre de la liste du ticket (critère 1) ; il départage aussi les égalités. */
export const MISTAKE_TYPES = [
  "agreement",
  "conjugation",
  "homophone",
  "accent",
  "punctuation",
  "capital",
  "spelling",
  "syntax",
  "other",
] as const;

/** Un type de faute (identifiant anglais, aussi celui demandé à l'assistant). */
export type MistakeType = (typeof MISTAKE_TYPES)[number];

/** Nom affiché de chaque type. */
export const MISTAKE_LABELS: Record<MistakeType, string> = {
  agreement: "Accord",
  conjugation: "Conjugaison",
  homophone: "Homophone",
  accent: "Accent",
  punctuation: "Ponctuation",
  capital: "Majuscule",
  spelling: "Orthographe d'usage",
  syntax: "Syntaxe",
  other: "Autre",
};

/** Description de chaque type donnée à l'assistant, pour qu'il le choisisse (critère 2). */
export const MISTAKE_HINTS: Record<MistakeType, string> = {
  agreement: "accord en genre et en nombre (noms, adjectifs, participes passés)",
  conjugation: "conjugaison (terminaison du verbe, temps, infinitif ou participe)",
  homophone: "homophones (a/à, ces/ses, et/est, on/ont, son/sont, ou/où…)",
  accent: "accent manquant ou en trop",
  punctuation: "ponctuation (virgule, point, espaces autour des signes)",
  capital: "majuscule ou minuscule",
  spelling: "orthographe d'usage d'un mot",
  syntax: "syntaxe (ordre des mots, négation, mot manquant)",
  other: "autre",
};

/** Règle courte de chaque type, écrite dans Nano Buro, hors ligne (critère 11). */
export const MISTAKE_RULES: Record<MistakeType, string> = {
  agreement:
    "L'adjectif s'accorde avec le nom : « des enfants contents ». Après « être », le participe passé s'accorde avec le sujet : « elles sont parties ».",
  conjugation:
    "Le verbe s'accorde avec son sujet : « ils jouent », « nous allons ». Après un autre verbe ou une préposition, il reste à l'infinitif : « je vais manger ».",
  homophone:
    "Remplacez le mot pour vérifier : « a » par « avait » (sinon « à »), « est » par « était » (sinon « et »), « ont » par « avaient » (sinon « on »).",
  accent:
    "Un accent change le mot ou sa prononciation : « été », « où », « là ». Les majuscules gardent leur accent : « À bientôt ».",
  punctuation:
    "Pas de virgule entre le sujet et son verbe. Avant « ; : ! ? », une espace, et après chaque signe aussi.",
  capital:
    "Une majuscule au début de chaque phrase et aux noms propres : « Paris », « Marie ». Les jours et les mois s'écrivent en minuscules : « lundi 5 novembre ».",
  spelling:
    "L'orthographe d'usage s'apprend mot par mot : en cas de doute, vérifiez dans un dictionnaire. Relisez en priorité les mots de vos exemples.",
  syntax:
    "Une phrase claire a un sujet et un verbe, dans un ordre simple. La négation a deux parties : « je ne sais pas ».",
  other:
    "Corrections diverses proposées par l'assistant. Relisez les exemples pour repérer ce qui revient.",
};

const TYPE_SET: ReadonlySet<string> = new Set(MISTAKE_TYPES);

/**
 * Type de faute lu dans une réponse de l'assistant ; un type absent ou inconnu devient « Autre »
 * (critère 3). La casse et les espaces autour sont ignorés.
 */
export function mistakeType(value: unknown): MistakeType {
  if (typeof value !== "string") return "other";
  const id = value.trim().toLowerCase();
  return TYPE_SET.has(id) ? (id as MistakeType) : "other";
}

/** Un exemple de faute corrigée : « avant → après ». */
export interface MistakeExample {
  before: string;
  after: string;
}

/** Compte d'un type de faute. */
export interface MistakeCount {
  count: number;
  /** Les 3 derniers exemples au plus, le plus récent en premier (critère 6). */
  examples: MistakeExample[];
}

/** Statistiques de cet ordinateur (critère 7). */
export interface MistakeStats {
  /** Date de début du compte, au format ISO (critère 12). */
  since: string;
  /** Types qui ont au moins une faute. */
  types: Partial<Record<MistakeType, MistakeCount>>;
}

/** Une correction acceptée, à compter (critère 5). */
export interface AcceptedMistake {
  type: MistakeType;
  before: string;
  after: string;
}

/** Nombre d'exemples gardés par type (critère 6). */
export const MAX_EXAMPLES = 3;

/** Longueur d'un exemple, en caractères affichés (critère 6). */
export const MAX_EXAMPLE_LENGTH = 40;

/** Part cumulée des types en noir dans le Pareto (critère 10). */
export const PARETO_THRESHOLD = 0.8;

const graphemes = new Intl.Segmenter("fr", { granularity: "grapheme" });

/**
 * Exemple coupé à 40 caractères affichés au plus, points de suspension compris. Un accent ou un
 * emoji n'est jamais coupé en deux (découpage en graphèmes) ; les espaces sont resserrés.
 */
export function truncateExample(text: string, max = MAX_EXAMPLE_LENGTH): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const parts = Array.from(graphemes.segment(clean), ({ segment }) => segment);
  if (parts.length <= max) return clean;
  return `${parts
    .slice(0, max - 1)
    .join("")
    .trimEnd()}…`;
}

/** Statistiques vides, qui commencent à `now` (premier lancement ou « Remettre à zéro », critère 14). */
export function emptyMistakeStats(now: Date): MistakeStats {
  return { since: now.toISOString(), types: {} };
}

/**
 * Ajoute des corrections acceptées : chacune compte une fois (critère 5), et devient le plus récent
 * exemple de son type (critère 6). Les statistiques reçues ne sont pas modifiées.
 */
export function recordMistakes(stats: MistakeStats, accepted: AcceptedMistake[]): MistakeStats {
  const types: MistakeStats["types"] = { ...stats.types };
  for (const { type, before, after } of accepted) {
    const current = types[type] ?? { count: 0, examples: [] };
    const example = { before: truncateExample(before), after: truncateExample(after) };
    types[type] = {
      count: current.count + 1,
      examples: [example, ...current.examples].slice(0, MAX_EXAMPLES),
    };
  }
  return { since: stats.since, types };
}

/** Nombre total de fautes comptées (critère 12). */
export function totalMistakes(stats: MistakeStats): number {
  return MISTAKE_TYPES.reduce((sum, type) => sum + (stats.types[type]?.count ?? 0), 0);
}

function isExample(value: unknown): value is MistakeExample {
  if (value === null || typeof value !== "object") return false;
  const { before, after } = value as Record<string, unknown>;
  return typeof before === "string" && typeof after === "string";
}

/**
 * Statistiques relues du stockage. Ce qui est abîmé ou inconnu est ignoré, sans planter : un compte
 * illisible repart de zéro à `now`.
 */
export function readMistakeStats(value: unknown, now: Date): MistakeStats {
  if (value === null || typeof value !== "object") return emptyMistakeStats(now);
  const { since, types } = value as Record<string, unknown>;
  const start =
    typeof since === "string" && !Number.isNaN(Date.parse(since)) ? since : now.toISOString();
  const result: MistakeStats = { since: start, types: {} };
  if (types === null || typeof types !== "object") return result;
  for (const type of MISTAKE_TYPES) {
    if (!Object.hasOwn(types, type)) continue;
    const entry = (types as Record<string, unknown>)[type];
    if (entry === null || typeof entry !== "object") continue;
    const { count, examples } = entry as Record<string, unknown>;
    if (typeof count !== "number" || !Number.isInteger(count) || count <= 0) continue;
    result.types[type] = {
      count,
      examples: (Array.isArray(examples) ? examples : [])
        .filter(isExample)
        .slice(0, MAX_EXAMPLES)
        .map(({ before, after }) => ({ before, after })),
    };
  }
  return result;
}

/** Une barre du Pareto (critère 10). */
export interface ParetoRow {
  type: MistakeType;
  label: string;
  count: number;
  /** Part du total, de 0 à 1. */
  share: number;
  /** Part cumulée jusqu'à ce type compris, de 0 à 1. */
  cumulative: number;
  /** Vrai pour les types qui font les premiers 80 % : en noir, avec leur règle (critère 11). */
  vital: boolean;
}

/**
 * Barres du Pareto : les types qui ont au moins une faute, du plus fréquent au plus rare (à égalité,
 * dans l'ordre de la liste), avec la part cumulée. Un type est en noir tant que le cumul des types
 * avant lui n'atteint pas 80 % : celui qui franchit le seuil l'est donc aussi. À égalité de nombre,
 * l'ordre de la liste départage, aussi pour la couleur (choix simple, à confirmer par le PO).
 */
export function paretoRows(stats: MistakeStats): ParetoRow[] {
  const counted = MISTAKE_TYPES.map((type) => ({ type, count: stats.types[type]?.count ?? 0 }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count);
  const total = counted.reduce((sum, { count }) => sum + count, 0);
  const rows: ParetoRow[] = [];
  let before = 0;
  for (const { type, count } of counted) {
    // Calcul en entiers : 4 × 20 % fait exactement 80 %.
    const vital = before * 10 < total * Math.round(PARETO_THRESHOLD * 10);
    before += count;
    rows.push({
      type,
      label: MISTAKE_LABELS[type],
      count,
      share: count / total,
      cumulative: before / total,
      vital,
    });
  }
  return rows;
}
