# B2 : Retrait sur une sélection qui mélange liste et paragraphes

**Suivi** : Issue [#103](https://github.com/HnaoAI/nano-office/issues/103), le statut se lit sur le tableau Kanban
**Dépend de** : T2.14 (lot I)
**Taille estimée** : S
**Lot** : à livrer avec le lot J, dans la même PR

## Constat du product owner (2026-10-24)

Texte d'essai : un paragraphe « Au marché : », une liste à puces « Pommes », « Poireaux », « Fromage », puis deux
paragraphes « Ensuite, passer à la boulangerie… » et « Penser à rapporter les sacs. ».

- **Essai A** : sélection de « Poireaux » jusqu'à la fin du dernier paragraphe, puis « Augmenter le retrait » :
  **rien ne bouge**. (`changeIndent` voit le curseur dans une liste et appelle seulement `indentListItem`,
  qui échoue parce que la sélection sort de la liste.)
- **Essai B** : sélection de « Au marché : » jusqu'à « Fromage » : seul **« Au marché : »** se décale, la liste est
  ignorée. (`indentableBlocks` saute les listes.)

## Critères d'acceptation

1. Avec une sélection qui mélange des éléments de liste et des paragraphes ou des titres, « Augmenter le retrait » et
   « Diminuer le retrait » traitent **chaque ligne selon sa nature**, comme Word :
   - les paragraphes et les titres changent de retrait (1,25 cm, de 0 à 5 niveaux) ;
   - les éléments de liste changent de niveau, comme Tab et Shift+Tab, quand c'est possible.
2. Un élément qui ne peut pas bouger (premier élément d'une liste, niveau 3 atteint, ou retrait déjà au maximum) reste
   en place **sans empêcher les autres** de bouger.
3. Tout se fait en **une seule transaction** : un seul Ctrl/Cmd+Z remet tout.
4. Les boutons sont actifs dès qu'au moins une ligne de la sélection peut bouger, et grisés sinon.
5. Rien ne change pour une sélection entièrement dans une liste, ou entièrement hors liste (tests du lot I inchangés).
6. Tests : Vitest pour les essais A et B, pour Diminuer, pour le premier élément de liste et pour le niveau maximal ;
   Playwright pour l'essai A tel que décrit, suivi d'un Ctrl/Cmd+Z.

## Vérification manuelle

Refaire les essais A et B du constat : dans A, « Poireaux » et « Fromage » deviennent des sous-points de
« Pommes », et les deux paragraphes se décalent ; dans B, « Au marché : » se décale, ainsi que « Poireaux » et
« Fromage » (« Pommes », premier élément, reste en place).
