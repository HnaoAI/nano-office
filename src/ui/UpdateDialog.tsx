// Fenêtre « Nano Buro se met à jour » (H3, critères 2, 3, 7 et 8) : boîte de dialogue de la charte sur la
// page estompée, avec un N qui tourne sur lui-même. Le reste de la page est rendu inerte par App.tsx,
// et le clavier bloqué par updateLock.ts.
import { useEffect, useRef } from "react";
import { UPDATE_REASSURANCE, UPDATE_TITLE } from "./updateTexts";

/** Fenêtre affichée pendant la mise à jour au lancement. Aucun bouton : elle se ferme d'elle-même. */
export function UpdateDialog() {
  const dialog = useRef<HTMLElement>(null);
  // Critère 3 : le focus est dans la fenêtre, jamais dans l'éditeur derrière.
  useEffect(() => {
    dialog.current?.focus();
  }, []);
  return (
    <div className="nano-dialog-layer nano-update-layer">
      <div className="nano-dialog-backdrop" aria-hidden="true" />
      <section
        ref={dialog}
        className="nano-dialog nano-update"
        role="alertdialog"
        aria-modal="true"
        aria-busy="true"
        aria-labelledby="nano-update-title"
        aria-describedby="nano-update-text"
        tabIndex={-1}
      >
        <div className="nano-update-mark" aria-hidden="true">
          <span className="nano-update-n">N</span>
        </div>
        <div className="nano-dialog-text">
          <h2 id="nano-update-title">{UPDATE_TITLE}</h2>
          <p id="nano-update-text">{UPDATE_REASSURANCE}</p>
        </div>
      </section>
    </div>
  );
}
