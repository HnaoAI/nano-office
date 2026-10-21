# PL5 : Trier un tableau

**Suivi** : Issue [#63](https://github.com/HnaoAI/nano-office/issues/63), le statut se lit sur le tableau Kanban
**Dépend de** : T1.8
**Taille estimée** : M
**Tranche** : plus tard, non planifié

## User story

En tant que membre de la famille, je veux trier les lignes d'un tableau selon une colonne,
afin de ranger une liste par nom, par date ou par prix.

## À préciser avant le lancement

- Tri croissant ou décroissant sur la colonne du curseur. La ligne d'en-tête ne bouge jamais.
- Comparaison à la française (`Intl.Collator("fr")`), nombres et dates reconnus.
- Un seul Ctrl/Cmd+Z, et les identifiants de cellule suivent leur ligne (règle produit 5).
