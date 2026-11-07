# P2 : Rendre fiable le test des listes (Ctrl/Cmd+Z, critère 11)

**Suivi** : Issue [#132](https://github.com/HnaoAI/nano-office/issues/132), le statut se lit sur le tableau Kanban
**Dépend de** : rien
**Taille estimée** : S
**Lot** : O. Rapidité (avec P1, qui touche aussi l'historique d'annulation)

## Constat

Le test `tests/e2e/listes.spec.ts`, « critère 11 : Ctrl/Cmd+Z annule une création de liste ou un décalage en une seule
fois », a échoué sur la CI de la PR #131, qui ne changeait que de la documentation. Il a réussi à la relance. L'échec
est à la ligne 257 : juste après Tab, la structure lue n'est pas celle attendue. Une piste : cette lecture
(`expect(await listOutline(page))`) ne réessaie pas, contrairement à `expect.poll`, alors que l'affichage peut avoir
une image de retard. Autre piste : le regroupement des étapes d'annulation (`waitUndoGroup`).

## Critères d'acceptation

1. La **cause** de l'instabilité est trouvée et expliquée dans la PR : le test, ou le code.
2. Le test vérifie **exactement la même chose** qu'avant : Tab décale l'élément, un premier Ctrl/Cmd+Z annule seulement
   le décalage, un second annule seulement la création de la liste. Aucune attente n'est affaiblie (accord du PO du
   2026-11-07 pour corriger ce test, sans en changer le sens).
3. Si la cause est dans le code (une étape d'annulation mal regroupée), le code est corrigé, et non le test.
4. Le test passe **50 fois de suite** en local (`--repeat-each=50`), et aussi avec plusieurs tests en parallèle.
5. Les autres tests qui lisent la structure d'une liste juste après une touche, sans réessayer, sont vérifiés et
   rendus fiables de la même façon, avec la liste des tests touchés dans la PR.
