# B1 : Cmd+Z n'annule pas sur le Mac

**Suivi** : Issue [#51](https://github.com/HnaoAI/nano-office/issues/51), le statut se lit sur le tableau Kanban
**Taille estimée** : S
**Branche** : `ticket/B1-annuler-mac`
**Lot** : à traiter avec H2, dans la même PR (deux petites corrections)

## Constat du product owner (2026-10-21)

Sur le Mac, dans Chrome, avec un clavier AZERTY, on tape quelques mots puis Cmd+Z : rien n'est annulé.
Le bouton « Annuler » de la barre, lui, fonctionne. Le PC avec Edge n'est pas en cause.
Les tests Playwright de Ctrl/Cmd+Z passent, mais sous Linux, où la touche est Ctrl.

## Pistes (à vérifier, pas à supposer)

1. **Menu Édition de Chrome sur Mac** : dans une fenêtre d'application installée, Cmd+Z peut passer par le menu
   « Édition › Annuler » du navigateur. Celui-ci envoie un événement `beforeinput` de type `historyUndo`
   (et `historyRedo` pour Cmd+Shift+Z), au lieu d'un `keydown` que ProseMirror reconnaîtrait. L'annulation
   native du navigateur ne connaît pas l'historique Yjs, et rien ne se passe.
2. **Raccourci non reconnu** : un `keydown` arrive, mais n'est pas associé à `Mod-z` par le clavier de
   l'extension Collaboration (disposition AZERTY, ou majuscule avec Shift).

## Critères d'acceptation

1. Sur le Mac, Cmd+Z annule et Cmd+Shift+Z rétablit, dans l'application installée et dans un onglet de Chrome,
   avec un clavier AZERTY comme QWERTY. Sous Windows, Ctrl+Z et Ctrl+Y (ou Ctrl+Shift+Z) font de même.
2. Les événements `beforeinput` `historyUndo` et `historyRedo` sur l'éditeur sont interceptés
   (`preventDefault`) et appellent l'annulation ou le rétablissement de Yjs, comme le bouton. C'est utile
   aussi pour le menu « Édition › Annuler » cliqué à la souris.
3. Le raccourci est reconnu au **caractère produit** (`event.key` « z » ou « Z »), comme le fait l'éditeur, et non
   à la touche physique. Sur AZERTY, la touche physique KeyZ est le « W » : Cmd+W doit continuer de fermer la fenêtre.
4. Une seule annulation par appui : jamais deux (`keydown` puis `beforeinput` pour le même appui).
5. Les autres raccourcis (titres, listes, alignement, Enregistrer) ne changent pas.

## Tests attendus

- Playwright : un `beforeinput` `historyUndo` simulé annule la dernière saisie, et `historyRedo` la rétablit.
- Playwright : avec la plateforme Mac simulée (si `platform.ts` le permet), Meta+z annule une seule fois.
- Vitest : la reconnaissance du raccourci par `event.key`, avec et sans Shift, et jamais par `event.code` seul.

## Vérification manuelle

Sur le Mac, dans l'application installée, taper une phrase, puis Cmd+Z et Cmd+Shift+Z. Faire de même avec le menu « Édition › Annuler ».
