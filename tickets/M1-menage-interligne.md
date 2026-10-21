# M1 : Ménage (fichiers trop longs, actions GitHub) et icône de l'interligne

**Suivi** : Issue [#70](https://github.com/HnaoAI/nano-office/issues/70), le statut se lit sur le tableau Kanban
**Dépend de** : lot F
**Taille estimée** : S
**Branche** : `ticket/M1-menage`
**Lot** : à faire avant le lot G, en une seule PR

## Pourquoi

Après les lots D, E et F, trois fichiers dépassent la limite de 300 lignes des règles de travail, et GitHub signale
que les actions utilisées tournent sur une version de Node bientôt retirée. Le PO ne trouvait pas non plus le
réglage d'interligne : la liste n'affiche que « Par défaut », sans icône.

## Critères d'acceptation

**Interligne (visible par le PO)**

1. Une icône d'interligne au trait (des lignes, avec une double flèche verticale), au style des autres icônes,
   s'affiche devant la liste « Interligne ». Elle fait partie du même contrôle, comme la liste Police.
2. Le premier choix s'appelle « Interligne normal » au lieu de « Par défaut ». Les valeurs enregistrées ne changent
   pas : un fichier existant s'ouvre et s'affiche à l'identique.
3. Le nom accessible reste « Interligne ». Le test Playwright qui lisait « Par défaut » peut être adapté au nouveau
   libellé : changement autorisé par le PO, à signaler dans la PR.

**Ménage (invisible)**

4. Découper sans rien changer au comportement, avec chaque morceau sous 300 lignes :
   - `src/ui/useDocumentFile.ts` (349 lignes) ;
   - `src/core/wordBlocks.ts` (349 lignes) ;
   - `src/editor/images.ts` (318 lignes), en séparant le collage et le dépôt, comme proposé au lot D.
   Aucun test ne change, à part les chemins d'import. Mettre à jour les README des dossiers.
5. Passer `actions/checkout` et `actions/setup-node` à leur version actuelle (v5 ou suivante), dans `ci.yml`
   et `deploy.yml`. La CI et la publication restent vertes.
6. Vérifier qu'aucun autre fichier de `src/` ne dépasse 300 lignes. Sinon, le signaler dans la PR, sans le découper.

## Vérification manuelle

Sur la version publiée : l'icône apparaît devant la liste d'interligne, et la liste propose « Interligne normal », 1,
1,15, 1,5 et 2. Un document existant s'affiche comme avant.
