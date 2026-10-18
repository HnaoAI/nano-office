# tests

Même arborescence que `src/`.

- `core/` : tests Vitest de la logique pure, sans DOM (`npm test`)
  - `helpers.ts` : construire un Y.Doc à partir d'un JSON, document d'exemple
  - `schema.test.ts`, `fileFormat.test.ts`, `base64.test.ts`
- `e2e/` : tests Playwright dans Chromium (`npm run test:e2e`), vide jusqu'à T0b
