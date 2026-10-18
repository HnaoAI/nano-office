# tests

Même arborescence que `src/`.

- `core/` : tests Vitest de la logique pure, sans DOM (`npm test`)
  - `helpers.ts` : construire un Y.Doc à partir d'un JSON, document d'exemple
  - `schema.test.ts`, `fileFormat.test.ts`, `base64.test.ts`, `documentFile.test.ts`
- `storage/` : tests Vitest de `FileStore` avec de faux sélecteurs (`fakeHandles.ts`)
- `editor/` : tests Vitest de la configuration de l'éditeur, sans navigateur (`blockIds.test.ts`)
- `e2e/` : tests Playwright dans Chromium (`npm run test:e2e`)
  - `editeur.spec.ts` : saisie, gras, italique, annuler et rétablir, Y.Doc, identifiants (T0b)
  - `fichiers.spec.ts` : nouveau, ouvrir, enregistrer, Ctrl/Cmd+S, titre, fichiers invalides (T0c)
  - `fakeFileStore.ts` : fausse implémentation de `FileStore`, installée avant le chargement de la page
