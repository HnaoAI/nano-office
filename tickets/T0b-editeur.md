# T0b : Éditeur de texte relié à Yjs

**Suivi** : Issue [#3](https://github.com/HnaoAI/nano-office/issues/3), le statut se lit sur le tableau Kanban
**Dépend de** : T0a
**Taille estimée** : M
**Branche** : `ticket/T0b-editeur`

## Besoin utilisateur

En tant que membre de la famille, je veux écrire un texte sur plusieurs paragraphes,
mettre des mots en gras ou en italique, et annuler une erreur.

## Périmètre

- Éditeur Tiptap relié à un `Y.Doc` par l'extension de collaboration
- Barre d'outils simple : Gras, Italique, Annuler, Rétablir
- Identifiant stable sur chaque paragraphe
- Aucune mise en forme automatique pendant la saisie

## Critères d'acceptation

1. On peut saisir du texte sur plusieurs paragraphes.
2. Le bouton Gras et Ctrl/Cmd+B mettent la sélection en gras. Un second appui retire le gras.
3. Le bouton Italique et Ctrl/Cmd+I font de même pour l'italique.
4. Ctrl/Cmd+Z annule la dernière modification, Ctrl/Cmd+Shift+Z (et Ctrl+Y sous Windows) la rétablit.
5. Le contenu de l'éditeur est stocké dans le fragment `YJS_FRAGMENT_NAME` d'un `Y.Doc`, avec le schéma de `src/core/schema.ts`.
6. Chaque paragraphe porte un identifiant stable. Un paragraphe créé avec Entrée reçoit un nouvel identifiant, sans doublon.
7. Le correcteur orthographique du navigateur est actif dans l'éditeur.
8. Taper `# `, `1. `, `- ` ou `**texte**` ne crée aucune mise en forme.

## Note technique

L'éditeur utilise `documentExtensions` et `YJS_FRAGMENT_NAME` de `src/core/schema.ts` (T0a), sans redéfinir
le schéma ni l'identifiant de bloc : un fichier enregistré doit toujours correspondre à ce que l'éditeur affiche.
Avec l'extension de collaboration, l'historique de StarterKit est désactivé et l'annulation passe par
le gestionnaire d'annulation de Yjs. Les règles de saisie et de collage automatiques sont désactivées
(`enableInputRules: false`, `enablePasteRules: false`). Vérifier la licence de toute extension utilisée
pour les identifiants de blocs : si elle est payante, écrire un petit plugin et le signaler.

## Tests attendus

- Le script `test:e2e` redevient `playwright test`, sans `--pass-with-no-tests`, puisque des tests existent désormais.
- Playwright (Chromium) : saisie, gras, italique, annuler et rétablir, absence de mise en forme automatique,
  identifiants sans doublon après Entrée.

## Hors périmètre

Ouvrir et enregistrer, copie de secours, PWA, titres, listes, design soigné.

## Vérification manuelle

Sur un Mac avec Chrome, puis sur un PC Windows avec Edge : écrire quelques lignes avec du gras,
de l'italique, des accents et un emoji, puis annuler et rétablir.
