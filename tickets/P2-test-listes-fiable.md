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

## Cause trouvée par le relecteur (2026-11-07)

Message de la CI : après Tab, « deux » reste au niveau 1, donc **Tab n'a rien fait**.

Reproduit en local en ralentissant le processeur par 8 (`Emulation.setCPUThrottlingRate`) : **2 échecs sur 30**.
Cause : une **course entre Ctrl/Cmd+Fin et Tab**. Le navigateur déplace lui-même le curseur pour Fin ; ProseMirror ne
l'apprend que par l'événement `selectionchange`, qui arrive un peu plus tard. Son `forceFlush` du keydown ne relit que
les modifications du DOM, pas la sélection. Si Tab arrive avant, ProseMirror croit encore les deux lignes
sélectionnées (Ctrl/Cmd+A) : le premier élément ne peut pas être décalé, donc Tab ne fait rien (`indentListItem`
renvoie quand même `true`). Toute pause entre les deux touches fait disparaître l'échec, y compris le simple fait
d'ajouter une mesure.

Correction vérifiée en local : `await settleSelection(page)` (aide existante, deux images) entre Ctrl/Cmd+Fin et Tab
donne **60 réussites sur 60** dans les mêmes conditions. Un humain ne tape pas assez vite pour être concerné.

Même enchaînement (touche de déplacement du navigateur suivie aussitôt d'une commande) dans 15 autres endroits, à
vérifier un par un (critère 5) : `casse.spec.ts:58`, `copie-automatique.spec.ts:174`, `couleur.spec.ts:134`,
`editeur.spec.ts:177`, `export-word.spec.ts:210`, `listes.spec.ts:171`, `miniatures.spec.ts:154`,
`pinceau.spec.ts:286`, `plan.spec.ts:483`, `recherche.spec.ts:81`, `recherche.spec.ts:100`, `recherche.spec.ts:170`,
`tableaux.spec.ts:222`, `titres.spec.ts:68`, `titres.spec.ts:147` (numéros de ligne de la touche de commande, sur
`main` au 2026-11-07).

## Critères d'acceptation

1. La **cause** de l'instabilité est trouvée et expliquée dans la PR : le test, ou le code.
2. Le test vérifie **exactement la même chose** qu'avant : Tab décale l'élément, un premier Ctrl/Cmd+Z annule seulement
   le décalage, un second annule seulement la création de la liste. Aucune attente n'est affaiblie (accord du PO du
   2026-11-07 pour corriger ce test, sans en changer le sens).
3. Si la cause est dans le code (une étape d'annulation mal regroupée), le code est corrigé, et non le test.
4. Le test passe **50 fois de suite** en local (`--repeat-each=50`), et aussi avec plusieurs tests en parallèle.
5. Les autres tests qui lisent la structure d'une liste juste après une touche, sans réessayer, sont vérifiés et
   rendus fiables de la même façon, avec la liste des tests touchés dans la PR.
