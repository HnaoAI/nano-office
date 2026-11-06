# P1 : Entrée rapide dans un long document

**Suivi** : Issue [#130](https://github.com/HnaoAI/nano-office/issues/130), le statut se lit sur le tableau Kanban
**Dépend de** : rien
**Taille estimée** : S (la cause reste à trouver)
**Lot** : O. Rapidité

## User story

En tant que membre de la famille qui écrit un long document, je veux que la touche Entrée réponde tout de suite,
même au début d'un document de 100 pages, afin de ne pas sentir l'application bloquer.

## Constat (lot N, PR #128)

Avec le curseur en haut d'un document de 100 pages, une touche **Entrée** bloque l'éditeur environ **0,6 s**. On mesure
840 ms sur `main` avant le lot N, et 560 ms après. Le temps est passé dans le traitement d'Entrée par l'éditeur : le
calcul des pages (3 ms) et celui des feuilles (18 ms) n'y sont pour rien. Les lettres tapées ne sont pas touchées.
Une piste à vérifier en premier : une extension qui parcourt tout le document à chaque nouveau bloc (identifiants de
bloc, règle produit 5 ; Yjs ; plan ; sommaire ; repères de page).

## Critères d'acceptation

1. La **cause** est trouvée par une mesure (profil du navigateur ou chronométrage par extension), et décrite dans la PR
   avec les chiffres avant et après.
2. Dans un document de 100 pages, curseur en haut, une touche **Entrée** bloque l'éditeur **moins de 100 ms** (médiane
   sur 20 essais, dans la CI), au lieu d'environ 600 ms.
3. Même exigence pour **Retour arrière** au début d'un paragraphe et **Suppr** à la fin d'un paragraphe, qui joignent
   deux paragraphes, et pour **Ctrl/Cmd+Entrée** (saut de page).
4. Rien ne change pour l'utilisateur, en dehors de la rapidité. Chaque bloc garde un identifiant **unique et stable**
   (règle produit 5) : le nouveau paragraphe reçoit un nouvel identifiant, et celui des autres ne change pas. Après
   enregistrement et réouverture, les identifiants sont les mêmes.
5. Annuler (Ctrl/Cmd+Z) défait l'Entrée en une étape, comme aujourd'hui. Le plan, le sommaire, les feuilles et le
   compteur de pages suivent toujours.
6. Aucun test existant n'est affaibli. Le format `.nano` ne change pas.

## Tests attendus

- Playwright : document de 100 pages, 20 Entrée en haut, délai médian sous 100 ms et maximum sous 250 ms ; même chose
  pour Retour arrière, Suppr et Ctrl/Cmd+Entrée.
- Vitest ou Playwright : après les Entrée, tous les identifiants de bloc sont uniques, ceux des blocs d'origine sont
  inchangés, et ils survivent à l'enregistrement et à la réouverture.

## Vérification manuelle

1. Ouvrir un document très long (100 pages : par exemple copier-coller plusieurs fois un long texte).
2. Se placer tout en haut et appuyer plusieurs fois sur Entrée : chaque nouvelle ligne apparaît tout de suite.
3. Ctrl/Cmd+Z : les lignes vides disparaissent une à une.
