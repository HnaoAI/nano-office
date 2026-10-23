// Blocage du clavier pendant la fenêtre « Nano Buro se met à jour » (H3, critère 3). L'attribut `inert`
// arrête les clics et le focus, mais pas les raccourcis écoutés sur `window` (Ctrl/Cmd+S, P, F…) :
// cet écouteur passe avant eux.
// INVARIANT : il est installé au chargement de ce module, avant le premier rendu, donc avant les
// écouteurs des raccourcis (installés par des effets React) ; sur `window` en phase de capture,
// les écouteurs s'exécutent dans l'ordre d'installation.

let locked = false;

function block(event: KeyboardEvent) {
  if (!locked) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

if (typeof window !== "undefined") {
  for (const type of ["keydown", "keypress", "keyup"] as const) {
    window.addEventListener(type, block, { capture: true });
  }
}

/**
 * Bloque ou débloque toutes les touches de la page, raccourcis du navigateur compris quand il le permet.
 * @param value vrai pendant la fenêtre de mise à jour
 */
export function setKeyboardLocked(value: boolean): void {
  locked = value;
}
