# tests

Même arborescence que `src/`.

- `core/` : tests Vitest de la logique pure, sans DOM (`npm test`)
  - `helpers.ts` : construire un Y.Doc à partir d'un JSON, document d'exemple
  - `schema.test.ts`, `fileFormat.test.ts`, `base64.test.ts`, `documentFile.test.ts`, `backup.test.ts`
  - `formatting.test.ts` : aller-retour du format avec la mise en forme du lot A
  - `appUpdate.test.ts`, `appVersion.test.ts` : décision de mise à jour au démarrage et numéro de version (H1)
- `storage/` : tests Vitest de `FileStore` avec de faux sélecteurs (`fakeHandles.ts`)
- `ui/` : tests Vitest de la feuille de style : variables de la charte, aucune nouvelle variable après U1a (`styles.test.ts`)
- `editor/` : tests Vitest de la configuration de l'éditeur, sans navigateur (`blockIds.test.ts`, `blockStyle.test.ts`)
- `e2e/` : tests Playwright dans Chromium (`npm run test:e2e`)
  - `editeur.spec.ts` : saisie, gras, italique, annuler et rétablir, Y.Doc, identifiants (T0b)
  - `fichiers.spec.ts` : nouveau, ouvrir, enregistrer, Ctrl/Cmd+S, titre, fichiers invalides (T0c)
  - `secours.spec.ts` : copie de secours, récupération après rechargement, question à l'ouverture, alerte avant fermeture (T0d)
  - `reseau.spec.ts` : aucune donnée de document sur le réseau pendant l'édition, l'ouverture et l'enregistrement (T0e)
  - `hors-ligne.spec.ts` : version construite installable et hors ligne (T0e, projet Playwright « pwa », après `npm run build`)
  - `mise-a-jour.spec.ts` : numéro de version « dev », signes de travail commencé avant une mise à jour (H1)
  - `publication.spec.ts` : version construite sous /nano-office/, installable, hors ligne, numéro de version (H1, projet Playwright « pages »)
  - `interface.spec.ts` : structure de l'interface et polices intégrées (U1a)
  - `titres.spec.ts` : titres, raccourcis Mac et Windows, AltGr, Entrée, `# `, annulation (T1.1)
  - `formatHelpers.ts` : démarrer l'éditeur, lire le Y.Doc, enregistrer puis rouvrir (lot A)
  - `etats-messages.spec.ts` : indicateur d'enregistrement, messages et boîte de dialogue de récupération (U1b)
  - `backupHelpers.ts` : attendre la fin des écritures de la copie de secours
  - `networkWatch.ts` : journal des requêtes et messages envoyés par la page
  - `fakeFileStore.ts` : fausse implémentation de `FileStore`, installée avant le chargement de la page ; peut retenir les écritures ou faire échouer un enregistrement (U1b)
