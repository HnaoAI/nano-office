// Accès en lecture au Y.Doc pour les tests Playwright (T0b, critère 5), en développement seulement.
// Vite retire ce code de la version publiée (`import.meta.env.DEV` vaut false au build).
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import type * as Y from "yjs";
import { YJS_FRAGMENT_NAME } from "../core/schema";
import type { DocumentJson } from "../core/types";

/** Outils exposés sur `window.__nanoTest` pour les tests d'interface. */
export interface NanoTestHook {
  /** Contenu du fragment du document dans le Y.Doc, au format JSON de Tiptap. */
  documentJson: () => DocumentJson;
}

declare global {
  interface Window {
    __nanoTest?: NanoTestHook;
  }
}

/**
 * Expose le contenu du Y.Doc sur `window.__nanoTest`, uniquement en développement.
 * Lecture seule : les tests ne modifient jamais le document par ce biais.
 */
export function exposeDocumentForTests(ydoc: Y.Doc): void {
  if (!import.meta.env.DEV) {
    return;
  }
  window.__nanoTest = {
    documentJson: () =>
      yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment(YJS_FRAGMENT_NAME)) as DocumentJson,
  };
}
