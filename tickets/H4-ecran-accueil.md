# H4 : Écran d'accueil au N dès l'ouverture

**Suivi** : Issue [#138](https://github.com/HnaoAI/nano-office/issues/138), le statut se lit sur le tableau Kanban
**Dépend de** : H1, H2, H3 (mise à jour au lancement et fenêtre au N)
**Taille estimée** : S
**Lot** : P. Accueil

## User story

En tant que membre de la famille, je veux voir le N de Nano Buro tourner dès que j'ouvre l'application, comme une
présentation, et non une fenêtre qui surgit quelques secondes plus tard.

## Constat (retour du PO, 2026-11-08)

La fenêtre « Nano Buro se met à jour » (H3) n'apparaît qu'une fois la mise à jour **découverte** par le service worker,
quelques secondes après l'ouverture, alors que la page est déjà affichée.

## Décisions du product owner (2026-11-08)

- Un écran d'accueil au N qui tourne s'affiche à **chaque ouverture**, comme une présentation.
- Sans mise à jour, il reste **1,5 seconde**, sous le N : « Nano Buro », avec la version en petit.
- Avec une mise à jour, il devient « Nano Buro se met à jour » **sans disparaître**, et les règles de H3 s'appliquent (au
  moins 5 secondes en tout, déblocage au bout de 20 secondes, message « mis à jour » après le rechargement).
- C'est la même fenêtre que H3, au même style : pas de nouvel écran.

## Critères d'acceptation

1. L'écran s'affiche **dès le premier affichage de la page**, avant le chargement du JavaScript de l'application : il
   est écrit directement dans `index.html` (balisage et style en ligne, polices et variables de la charte), et
   l'application le reprend ensuite à son compte. Aucun instant où le document est visible avant lui.
2. Sous le N qui tourne : « Nano Buro » et la version (`v<date>·<commit>`) en petit. Le fond est la page estompée, ou
   le fond de l'application tant que rien n'est chargé.
3. **Sans mise à jour**, il disparaît **1,5 seconde** après son apparition, et le document restauré (H2) ou vide est là,
   le curseur à sa place. La vérification de mise à jour est attendue au plus jusqu'à **3 secondes** : sans réponse
   (réseau lent), l'écran disparaît quand même, et une mise à jour trouvée plus tard suit la règle de H1 (lancement
   suivant), sans faire surgir de fenêtre.
4. **Avec une mise à jour** trouvée pendant l'écran, le texte devient « Nano Buro se met à jour » sans que l'écran
   disparaisse ni clignote, puis H3 s'applique.
5. Pendant l'écran, Nano Buro est **bloqué** comme dans H3 (critère 3) : ni clic, ni frappe, ni raccourci n'atteignent
   le document, et rien de ce qui est tapé n'est perdu ni envoyé dans le document.
6. **Hors ligne**, l'écran dure 1,5 seconde, sans attendre le réseau.
7. Moins d'animations demandé par le système (`prefers-reduced-motion`) : le N pulse doucement au lieu de tourner (H3,
   critère 7). Accessibilité : `role="status"` et `aria-busy="true"` pendant l'accueil, `role="alertdialog"` pendant
   la mise à jour (H3, critère 8).
8. L'écran ne s'affiche qu'à l'**ouverture** de l'application : jamais pendant le travail, ni à l'ouverture d'un fichier
   ou à « Nouveau ».
9. Les tests d'interface existants ne sont pas ralentis de 1,5 seconde chacun : une option réservée au développement
   (comme `window.__nanoTest`) peut raccourcir l'accueil, et des tests dédiés vérifient les vraies durées. Les outils
   de démarrage des tests (`start`…) qui attendent la fin de l'accueil peuvent être adaptés, avec l'accord du PO
   (donné en lançant ce lot), sans affaiblir aucune attente.

## Tests attendus

- Playwright : l'écran est dans la page avant le chargement du script (réponse de `index.html`) ; il disparaît vers
  1,5 s sans mise à jour ; il devient « se met à jour » sans disparaître quand une mise à jour est simulée pendant
  l'accueil, puis H3 ; réseau lent (pas de réponse en 3 s) : il disparaît, aucune fenêtre ne surgit ensuite ; hors
  ligne : 1,5 s ; la frappe pendant l'accueil n'atteint pas le document ; `prefers-reduced-motion` ; aucun accueil à
  « Nouveau » ni à l'ouverture d'un fichier.
- Les tests de H3 continuent de passer ; ceux qui supposaient une fenêtre apparaissant après coup sont adaptés au
  nouveau déroulé, avec l'accord du PO, sans changer ce qu'ils vérifient.

## Vérification manuelle

1. Fermer Nano Buro, le rouvrir : le N tourne dès que la fenêtre s'ouvre, avec « Nano Buro » et la version, puis le
   document apparaît au bout d'environ 1,5 seconde.
2. Après une nouvelle publication : à l'ouverture, le même écran devient « Nano Buro se met à jour », puis le message
   « Nano Buro a été mis à jour » apparaît.
3. Couper le Wi-Fi et rouvrir Nano Buro : l'accueil dure 1,5 seconde, puis le document est là.
