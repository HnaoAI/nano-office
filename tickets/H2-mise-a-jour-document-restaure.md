# H2 : La mise à jour s'applique aussi quand un document a été restauré

**Suivi** : Issue [#49](https://github.com/HnaoAI/nano-office/issues/49), le statut se lit sur le tableau Kanban
**Dépend de** : H1, lot B
**Taille estimée** : S
**Branche** : `ticket/H2-mise-a-jour-document-restaure`
**Lot** : à traiter avec B1, dans la même PR (deux petites corrections)

## User story

En tant que membre de la famille, je veux que Nano Buro se mette à jour quand je l'ouvre,
afin de profiter des nouvelles fonctions sans avoir à quitter le navigateur.

## Contexte

Depuis le lot B, le dernier document est restauré depuis la copie de secours à **chaque** lancement.
H1, critère 6, comptait cette restauration comme « travail commencé » : la mise à jour était donc reportée
à chaque lancement, et ne s'installait que si toutes les fenêtres du navigateur étaient fermées.

Un document restauré ne risque rien : il est déjà dans la copie de secours, et un rechargement le rouvre à l'identique.

## Critères d'acceptation

1. Une restauration depuis la copie de secours **ne compte plus** comme travail commencé. Une nouvelle version s'applique
   donc au lancement si l'utilisateur n'a encore rien fait, même si un document a été restauré.
2. Les autres signes de travail commencé de H1 ne changent pas : frappe ou mise en forme, fichier ouvert ou en cours
   d'enregistrement, question de la copie de secours affichée.
3. Les autres signes de lancement non plus : le message du fichier retenu (PL3) avec « Enregistrer » ou « Autoriser »,
   et l'alerte « modifié ailleurs ». Un rechargement les affiche à nouveau, à l'identique.
4. Après le rechargement, le même document est restauré, avec le même contenu, le même fichier retenu et le même message.
   Rien n'est perdu, y compris des modifications de la copie de secours qui ne sont pas encore dans le fichier.
5. Toujours un seul rechargement au plus par lancement (H1).

## Tests

**Tests existants à changer** : changement autorisé par le product owner, car la règle de H1 change.
- `tests/core/appUpdate.test.ts` : `restoredFromBackup: true` donne maintenant `reload` quand rien d'autre n'a été fait.
- `tests/e2e/mise-a-jour.spec.ts` : le test « un document restauré compte comme travail commencé » est remplacé par
  « un document restauré n'empêche pas la mise à jour, et il est restauré à l'identique après le rechargement ».

Garder le champ `restoredFromBackup` dans `LaunchActivity` s'il sert ailleurs, sinon le retirer. Mettre à jour le
commentaire de `hasStartedWork`, qui cite la décision.

## Vérification manuelle

Après la fusion, ouvrir Nano Buro sur le Mac, sans quitter Chrome : le numéro de version doit changer au lancement.
