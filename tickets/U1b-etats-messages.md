# U1b : États d'enregistrement et messages selon la charte

**Suivi** : Issue [#27](https://github.com/HnaoAI/nano-office/issues/27), le statut se lit sur le tableau Kanban
**Découpé de** : U1, Issue [#24](https://github.com/HnaoAI/nano-office/issues/24)
**Dépend de** : U1a
**Taille estimée** : M
**Branche** : `ticket/U1b-etats-messages`

La PR qui livre ce ticket contient `Closes #27` et `Closes #24`.

## User story

En tant que membre de la famille, je veux voir d'un coup d'œil si mon document est enregistré et
comprendre les messages de l'application, afin d'écrire sans inquiétude.

## Référence

La charte `docs/design/README.md` et la maquette `docs/design/maquette/` (`Messages.dc.html`,
`Recuperation.dc.html`) font foi. Ce ticket réutilise les variables `--nano-…`, les icônes et la
structure posées par U1a.

## Critères d'acceptation

1. L'en-tête affiche l'indicateur d'enregistrement entre le nom du document et le groupe Fichier.
2. L'indicateur affiche « Enregistré » ou « Non enregistré » selon l'état réel du document, avec le
   style de la charte. L'état « Enregistrement… » s'affiche pendant une écriture.
3. Les messages existants (document récupéré, téléchargement sur Safari et Firefox, fichier abîmé,
   fichier illisible, échec d'enregistrement) prennent le style de la charte : information sur fond
   blanc, alerte sur fond noir. Leurs textes ne changent pas.
4. Chaque message a un bouton de fermeture. Le message « document récupéré » propose aussi
   « Enregistrer sous… », et l'échec d'enregistrement aussi.
5. La question de la copie de secours s'affiche en boîte de dialogue centrée, au-dessus de la page
   estompée, avec le nom du fichier et les deux boutons de la maquette.
6. Les noms accessibles des boutons existants ne changent pas. Le bouton de fermeture a un `aria-label`.
7. Tous les tests existants passent **sans modification de leurs assertions**. Si un sélecteur doit
   changer, le signaler dans la PR et garder le même comportement vérifié.
8. À 390 px de large, rien ne déborde horizontalement, messages et boîte de dialogue compris.
9. Aucune nouvelle couleur, aucun nouveau rayon ni aucune nouvelle ombre en dur : tout vient des
   variables `--nano-…` de U1a.

## Note technique

- L'état « Enregistrement… » est aujourd'hui suivi en interne dans `useDocumentFile` (une référence,
  sans nouveau rendu) : il doit devenir un état lisible par l'interface, sans changer la logique
  d'enregistrement.
- Pas de nouvelle dépendance.

## Tests attendus

- Playwright : état de l'indicateur après une modification, pendant puis après un enregistrement,
  fermeture d'un message, actions « Enregistrer sous… » des messages, boîte de dialogue de récupération,
  absence de défilement horizontal à 390 px avec un message affiché.
- Les tests existants restent inchangés (critère 7).

## Hors périmètre

Fonctions de T1, mode sombre, logo définitif, animations, message « mise à jour disponible ».

## Vérification manuelle

Sur le Mac avec Chrome, comparer à la maquette, écran par écran : document récupéré, question de
récupération, fichier abîmé, échec d'enregistrement, les trois états de l'indicateur. Sur Firefox ou
Safari, vérifier le message de téléchargement. Refaire le contrôle principal sur le PC Windows avec Edge.
