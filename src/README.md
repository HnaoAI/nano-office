# src

Code de l'application. Règles d'import et rôle de chaque dossier : voir `CLAUDE.md`.

- `main.tsx` : point d'entrée, monte le composant racine dans `index.html`
- `core/` : logique pure (schéma du document, format `.nano`, types partagés)
- `ui/` : composants React, sans logique métier
