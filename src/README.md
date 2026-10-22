# src

Code de l'application. Règles d'import et rôle de chaque dossier : voir `CLAUDE.md`.

- `main.tsx` : point d'entrée, monte le composant racine dans `index.html`
- `core/` : logique pure (schéma du document, format `.nano`, types partagés)
- `storage/` : accès aux fichiers `.nano` derrière l'interface `FileStore`
- `editor/` : configuration de Tiptap (collaboration Yjs, identifiants de bloc)
- `ui/` : composants React, sans logique métier
- `assistant/` : appels à l'assistant facultatif (Claude ou Gemini) avec la clé de l'utilisateur, seul code qui envoie des données sur le réseau (T3.1)
