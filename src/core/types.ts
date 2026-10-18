// Types partagés de Nano Office. Aucune logique ici.
import type * as Y from "yjs";

/** Valeur du champ `format` d'un fichier `.nano`. */
export const NANO_FORMAT = "nano-office";

/** Version actuelle du format `.nano`. Tout changement de format l'incrémente (voir CLAUDE.md). */
export const NANO_FORMAT_VERSION = 1;

/** Document au format JSON de Tiptap / ProseMirror (nœud racine `doc`). */
export interface DocumentJson {
  type: string;
  content?: DocumentJson[];
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

/** Contenu d'un fichier `.nano` version 1, tel qu'écrit sur le disque (JSON en UTF-8). */
export interface NanoFileV1 {
  format: typeof NANO_FORMAT;
  version: 1;
  /** Identifiant unique du document (UUID), conservé à chaque enregistrement. */
  id: string;
  /** Copie lisible du document, calculée à partir de `ydoc`. Sert de secours. */
  content: DocumentJson;
  /** État Yjs encodé en base64 (`Y.encodeStateAsUpdate`). Source de vérité à l'ouverture. */
  ydoc: string;
}

/**
 * Raison d'un échec de lecture d'un fichier `.nano` :
 * - `invalid-json` : le texte n'est pas du JSON ;
 * - `not-nano` : JSON valide, mais pas un fichier Nano Office (format, version ou `id` absent ou invalide) ;
 * - `unsupported-version` : fichier Nano Office d'une version que cette application ne sait pas lire ;
 * - `corrupted` : `content` est absent ou abîmé (même si `ydoc` se lit), donc le document ne peut pas être vérifié.
 */
export type ParseError = "invalid-json" | "not-nano" | "unsupported-version" | "corrupted";

/** Résultat de `parseDocument` : jamais d'exception, un succès ou une erreur nommée. */
export type ParseResult =
  { ok: true; id: string; ydoc: Y.Doc; version: number } | { ok: false; error: ParseError };
