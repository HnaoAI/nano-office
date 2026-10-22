# M1 : Barre d'outils figée, icône de l'interligne, et ménage

**Suivi** : Issue [#70](https://github.com/HnaoAI/nano-office/issues/70), le statut se lit sur le tableau Kanban
**Dépend de** : lot F
**Taille estimée** : S
**Branche** : `ticket/M1-menage`
**Lot** : à faire avant le lot G, en une seule PR

## Pourquoi

Après les lots D, E et F, trois fichiers dépassent la limite de 300 lignes des règles de travail, et GitHub signale
que les actions utilisées tournent sur une version de Node bientôt retirée. Le PO ne trouvait pas non plus le
réglage d'interligne : la liste n'affiche que « Par défaut », sans icône. Enfin, la barre de mise en forme disparaît
quand on fait défiler un long document : il faut remonter pour l'utiliser (constat du PO, 2026-10-21).

## Critères d'acceptation

**Barre d'outils figée (visible par le PO)**

A. Quand on fait défiler le document, l'en-tête et la barre de mise en forme **restent en haut de la fenêtre**
   (`position: sticky`), comme dans Word et Google Docs. Seule la page défile dessous. Ils gardent leur fond et
   leur ombre, et le texte ne se lit jamais à travers.
B. La barre de recherche (T2.1), les grilles de couleurs, les menus et les messages s'affichent sous la barre figée,
   jamais dessous ni par-dessus le texte cherché. Une occurrence trouvée, ou le curseur qui descend au clavier,
   n'est jamais cachée par la barre (`scroll-margin-top` ou `scrollPadding` de l'éditeur).
C. Si la fenêtre est très basse (moins de 500 px de haut), seule la barre de mise en forme reste figée, sans
   l'en-tête, pour laisser de la place au texte. À 390 px de large, rien ne déborde, et la barre sur deux lignes
   reste figée.
D. À l'impression, rien ne change : seule la page s'imprime (T2.6).
E. Test Playwright : dans un document de 10 pages, faire défiler jusqu'en bas, puis cliquer sur « Gras » sans
   remonter. Le bouton est visible et fonctionne, et le texte tapé reste visible sous la barre.

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
   - `src/editor/suggestions.ts` (310 lignes) et `src/ui/AssistantPanel.tsx` (302 lignes), du lot G, s'il est fusionné.
   Aucun test ne change, à part les chemins d'import. Mettre à jour les README des dossiers.
5. Passer `actions/checkout` et `actions/setup-node` à leur version actuelle (v5 ou suivante), dans `ci.yml`
   et `deploy.yml`. La CI et la publication restent vertes.
6. Vérifier qu'aucun autre fichier de `src/` ne dépasse 300 lignes. Sinon, le signaler dans la PR, sans le découper.

## Vérification manuelle

Sur la version publiée : dans un long document, faire défiler jusqu'en bas. La barre reste en haut et s'utilise
sans remonter. Faire de même avec la recherche ouverte. L'icône apparaît devant la liste d'interligne, et la liste propose « Interligne normal », 1,
1,15, 1,5 et 2. Un document existant s'affiche comme avant.
