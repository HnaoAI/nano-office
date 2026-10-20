# tests

Même arborescence que `src/`.

- `core/` : tests Vitest de la logique pure, sans DOM (`npm test`)
  - `helpers.ts` : construire un Y.Doc à partir d'un JSON, document d'exemple
  - `schema.test.ts`, `fileFormat.test.ts`, `base64.test.ts`, `documentFile.test.ts`, `backup.test.ts`
  - `formatting.test.ts` : aller-retour du format avec la mise en forme du lot A et la couleur (T1.7) ; `textStyle.test.ts` : polices et tailles (T1.4)
  - `autoSave.test.ts` : délais de la sauvegarde automatique, pas de chevauchement, pause après un échec, avec une horloge simulée (T1.6)
  - `appUpdate.test.ts`, `appVersion.test.ts` : décision de mise à jour au démarrage et numéro de version (H1)
- `storage/` : tests Vitest de `FileStore` avec de faux sélecteurs (`fakeHandles.ts`) ; fichier retenu entre deux lancements (`fileMemory.test.ts`, PL3) ; fichier modifié ailleurs, non écrasé par la sauvegarde automatique (`changedOnDisk.test.ts`, T1.6)
- `ui/` : tests Vitest de la feuille de style : variables de la charte, aucune nouvelle variable après U1a (`styles.test.ts`)
- `editor/` : tests Vitest de la configuration de l'éditeur, sans navigateur (`blockIds.test.ts`, `blockStyle.test.ts`) ; copier-coller dans jsdom (`clipboard.test.ts`, T1.5) ; couleur et surlignage (`textColor.test.ts`, T1.7) ; `editorHelpers.ts` : éditeur sans affichage, collage, copie
- `e2e/` : tests Playwright dans Chromium (`npm run test:e2e`)
  - `editeur.spec.ts` : saisie, gras, italique, annuler et rétablir, Y.Doc, identifiants (T0b)
  - `fichiers.spec.ts` : nouveau, ouvrir, enregistrer, Ctrl/Cmd+S, titre, fichiers invalides (T0c)
  - `secours.spec.ts` : copie de secours, récupération après rechargement, question à l'ouverture, alerte avant fermeture (T0d)
  - `reseau.spec.ts` : aucune donnée de document sur le réseau pendant l'édition, l'ouverture et l'enregistrement (T0e)
  - `hors-ligne.spec.ts` : version construite installable et hors ligne, polices du document hors ligne (T0e, T1.4, projet Playwright « pwa », après `npm run build`)
  - `mise-a-jour.spec.ts` : numéro de version « dev », signes de travail commencé avant une mise à jour (H1)
  - `publication.spec.ts` : version construite sous /nano-office/, installable, hors ligne, numéro de version (H1, projet Playwright « pages »)
  - `interface.spec.ts` : structure de l'interface et polices intégrées (U1a)
  - `titres.spec.ts` : titres, raccourcis Mac et Windows, AltGr, Entrée, `# `, annulation (T1.1)
  - `listes.spec.ts` : boutons, raccourcis, Entrée sur élément vide, Tab et Shift+Tab, `1. ` sans effet, conversion (T1.2)
  - `alignement.spec.ts` : boutons, raccourcis consommés, sélection de plusieurs paragraphes, héritage après Entrée (T1.3)
  - `police.spec.ts` : police et taille sur une sélection et sur le texte tapé ensuite, sélection mixte, police inconnue, aucune requête externe (T1.4)
  - `collage.spec.ts` : collage HTML, texte brut, collage interne, copie vers une autre application, collage volumineux, annulation (T1.5)
  - `couleur.spec.ts` : grilles de couleurs à la souris et au clavier, sélection, texte tapé ensuite, état du bouton, réouverture, copier-coller, e-mail (T1.7)
  - `formatHelpers.ts` : démarrer l'éditeur, lire le Y.Doc, sélectionner un texte, coller depuis une autre application, lire le presse-papiers, enregistrer puis rouvrir (lots A et C)
  - `etats-messages.spec.ts` : indicateur d'enregistrement, messages et boîte de dialogue de récupération (U1b)
  - `sauvegarde-auto.spec.ts` : sauvegarde automatique, indicateur, document sans fichier, échec, Ctrl/Cmd+S, Safari et Firefox, alerte avant fermeture, fichier modifié ailleurs (T1.6)
  - `fichier-retenu.spec.ts` : fichier retrouvé au redémarrage, autorisation à redonner, fichier déplacé, mémoire des fichiers (PL3)
  - `backupHelpers.ts` : attendre la fin des écritures de la copie de secours
  - `networkWatch.ts` : journal des requêtes et messages envoyés par la page
  - `fakeFileStore.ts` : fausse implémentation de `FileStore`, installée avant le chargement de la page ; peut retenir les écritures ou faire échouer un enregistrement (U1b), garder ses fichiers au rechargement et simuler l'autorisation à redonner (PL3)
