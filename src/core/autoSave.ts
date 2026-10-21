// Déclenchement de la sauvegarde automatique (T1.6) : 3 secondes après la dernière modification,
// au plus 30 secondes pendant une saisie continue, jamais deux écritures en même temps, pause après un échec.
// Au-delà de 2 Mo enregistrés (document avec des photos, T1.9) : 10 secondes, et 60 secondes au plus.
// Logique pure : l'écriture elle-même est fournie par src/ui/useDocumentFile.ts.

/** Délai après la dernière modification (T1.6, critère 1). */
export const AUTO_SAVE_IDLE_MS = 3_000;
/** Délai maximal depuis la première modification non enregistrée, pendant une saisie continue (critère 2). */
export const AUTO_SAVE_MAX_MS = 30_000;

/**
 * Taille enregistrée au-delà de laquelle la sauvegarde automatique s'espace (décision du PO à la
 * relecture du lot D) : un gros fichier réécrit toutes les 3 secondes chargerait le dossier synchronisé.
 * La copie de secours, elle, reste immédiate.
 */
export const LARGE_DOCUMENT_BYTES = 2 * 1024 * 1024;
/** Délai après la dernière modification d'un gros document. */
export const LARGE_AUTO_SAVE_IDLE_MS = 10_000;
/** Délai maximal d'un gros document pendant une saisie continue. */
export const LARGE_AUTO_SAVE_MAX_MS = 60_000;

/**
 * Délais de la sauvegarde automatique pour un document dont le dernier fichier écrit ou ouvert
 * pesait `savedBytes` octets.
 */
export function autoSaveDelays(savedBytes: number): { idle: number; max: number } {
  return savedBytes > LARGE_DOCUMENT_BYTES
    ? { idle: LARGE_AUTO_SAVE_IDLE_MS, max: LARGE_AUTO_SAVE_MAX_MS }
    : { idle: AUTO_SAVE_IDLE_MS, max: AUTO_SAVE_MAX_MS };
}

/**
 * Enregistrement lancé par la sauvegarde automatique :
 * - `done` : l'enregistrement a eu lieu, ou il n'y avait rien à enregistrer ;
 * - `busy` : un autre enregistrement était en cours (critère 6), il faut réessayer plus tard.
 * Le résultat de l'écriture (réussite, échec) est signalé à part par `reportResult`, pour tous les enregistrements.
 */
export type AutoSaveRun = () => Promise<"done" | "busy">;

/**
 * Minuteur de la sauvegarde automatique d'un document. Un `AutoSaver` par document affiché.
 * Les minuteurs et l'horloge sont ceux de JavaScript, lus à chaque appel : les tests les remplacent
 * par les faux minuteurs de Vitest.
 * INVARIANT : `run` n'est jamais appelé deux fois en même temps, et jamais pendant une pause (critères 5 et 6).
 */
export class AutoSaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Moment de la première modification pas encore enregistrée, pour le maximum de 30 secondes. */
  private firstChange: number | null = null;
  private running = false;
  private stopped = false;
  private isPaused = false;
  private held = false;
  /** Une modification a eu lieu pendant une pause ou une attente : à enregistrer à la reprise. */
  private missed = false;

  /**
   * @param run enregistre le document s'il a des modifications ; ne doit jamais ouvrir de sélecteur
   * @param savedBytes taille du dernier fichier écrit ou ouvert, lue à chaque modification (T1.9)
   */
  constructor(
    private readonly run: AutoSaveRun,
    private readonly savedBytes: () => number = () => 0,
  ) {}

  /** Vrai après un échec ou `pause()`, jusqu'au prochain enregistrement réussi. */
  get paused(): boolean {
    return this.isPaused;
  }

  /**
   * Une modification a eu lieu : prévoit l'enregistrement (critères 1 et 2). Pendant une pause ou une
   * attente, elle est seulement retenue, pour être enregistrée à la reprise.
   */
  change(): void {
    if (this.stopped) return;
    if (this.isPaused || this.held) {
      this.missed = true;
      return;
    }
    const now = Date.now();
    const { idle, max } = autoSaveDelays(this.savedBytes());
    this.firstChange ??= now;
    this.schedule(Math.min(now + idle, this.firstChange + max) - now);
  }

  /**
   * Résultat d'un enregistrement, automatique ou manuel. Un échec met en pause, sans nouvel essai en
   * boucle ; un enregistrement réussi reprend la sauvegarde automatique (critère 5).
   */
  reportResult(status: "saved" | "failed"): void {
    if (status === "failed") {
      this.pause();
      return;
    }
    this.isPaused = false;
    this.resumeMissed();
  }

  /**
   * Met la sauvegarde automatique en attente, par exemple pendant « Ouvrir » : le fichier courant peut
   * alors changer avant le document affiché. Rien n'est écrit jusqu'à `release()`.
   */
  hold(): void {
    this.held = true;
    if (this.timer !== null) this.missed = true;
    this.cancel();
  }

  /** Fin de l'attente de `hold()` : les modifications faites entre-temps seront enregistrées. */
  release(): void {
    this.held = false;
    this.resumeMissed();
  }

  /** Suspend la sauvegarde automatique jusqu'au prochain enregistrement réussi, et annule celle prévue. */
  pause(): void {
    this.isPaused = true;
    this.cancel();
  }

  /** Arrête définitivement : le document n'est plus affiché. */
  dispose(): void {
    this.stopped = true;
    this.cancel();
  }

  private resumeMissed() {
    if (!this.missed || this.isPaused || this.held) return;
    this.missed = false;
    this.change();
  }

  private cancel() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.firstChange = null;
  }

  private schedule(delay: number) {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.fire(), Math.max(0, delay));
  }

  private async fire() {
    this.timer = null;
    if (this.stopped || this.isPaused || this.held) return;
    // Une écriture automatique est encore en cours : on réessaie après elle (critère 6).
    if (this.running) {
      this.schedule(autoSaveDelays(this.savedBytes()).idle);
      return;
    }
    this.firstChange = null;
    this.running = true;
    let outcome: "done" | "busy" = "done";
    try {
      outcome = await this.run();
    } catch {
      // Une panne inattendue ne doit pas bloquer les enregistrements suivants.
    } finally {
      this.running = false;
    }
    // Un enregistrement manuel était en cours : on réessaie plus tard, sans écrire en même temps.
    if (outcome === "busy" && !this.stopped && !this.isPaused && !this.held) {
      this.firstChange ??= Date.now();
      this.schedule(autoSaveDelays(this.savedBytes()).idle);
    }
  }
}
