# PL6 : Feuilles séparées et vue de toutes les pages en miniatures

**Suivi** : Issue [#76](https://github.com/HnaoAI/nano-office/issues/76), le statut se lit sur le tableau Kanban
**Dépend de** : T2.8 (repères de page), T2.9 (plan), T2.15 et T2.16 (numéros, en-tête et pied de page)
**Taille estimée** : M (au moins)
**Lot** : N. Comme dans Word (avec PL4), après PL4

## User story

En tant que membre de la famille, je veux voir chaque page comme une feuille séparée, comme dans Word, et toutes les
pages en miniatures sur un seul écran, afin d'avoir une vue d'ensemble de mon document.

## Décisions du product owner (2026-11-06)

- Les feuilles séparées sont **toujours** affichées, comme dans Word, sans bouton « Continu » : elles remplacent les
  traits en pointillé et les numéros dans la marge de T2.8 (critères 1 et 2).
- La vue en miniatures sert à **voir et aller** à une page. Pour déplacer des parties, il y a déjà le plan (T2.9).
- La vue en miniatures est un **nouvel écran, validé par le PO**, au style monochrome de la charte.

## Critères d'acceptation

**Feuilles séparées**

1. Chaque page s'affiche comme une **feuille blanche** au format de la mise en page (A4 portrait ou paysage, marges
   comprises), avec l'ombre et le rayon actuels de la page, séparée de la suivante par un espace gris de la couleur du
   fond de l'application.
2. Les feuilles coupent le texte **exactement où l'impression coupe** (T2.6, T2.8 critère 3) : même nombre de pages
   qu'à l'impression et dans le PDF, à une ligne près. Un paragraphe coupé continue en haut de la feuille suivante.
3. C'est **seulement un affichage** : le document n'est jamais modifié, aucun bloc ni caractère n'est ajouté, rien
   n'est enregistré, ni dans le fichier ni dans la copie de secours (décorations, comme T2.8 critère 9).
4. On écrit, sélectionne, copie et colle **à travers une coupure** comme dans un texte continu. Les flèches, Page
   précédente / suivante et la souris passent d'une feuille à l'autre ; le curseur ne tombe jamais dans l'espace gris.
5. Sur chaque feuille, l'**en-tête**, le **pied de page** et le **numéro de page** s'affichent dans les marges, en
   gris discret, comme à l'impression, en respectant « rien sur la première page » (T2.15, T2.16).
6. Le saut de page (Ctrl/Cmd+Entrée) termine la feuille ; sa ligne discrète « Saut de page » reste visible en bas de
   la feuille (T2.8 critère 7).
7. Le pied de la fenêtre garde « Page 3 sur 7 ». Les traits en pointillé et les numéros dans la marge de T2.8
   disparaissent. Les tests qui les vérifient sont adaptés aux feuilles, avec l'accord du PO (donné en lançant ce lot).
8. Les feuilles se recalculent pendant la frappe **sans ralentir la saisie**, au plus une fois par image affichée, y
   compris dans un document de **100 pages** (T2.8 critère 4).
9. Dans une fenêtre étroite, la feuille garde la largeur imprimée, comme aujourd'hui (décision du 2026-10-24).
10. Le plan (T2.9), la recherche, le sommaire, l'assistant et la barre figée (M1) amènent toujours le texte visé
    dans une feuille, jamais dans l'espace gris ni sous la barre.
11. L'impression, le PDF et l'export Word ne changent pas.

**Vue des pages en miniatures**

12. Un bouton **« Vue des pages »** (icône de grille au trait), à côté de « Page 3 sur 7 » en bas de la fenêtre,
    ouvre la vue.
13. La vue remplit la fenêtre : une grille de feuilles réduites (environ 160 px de large), dans l'ordre, chacune avec
    son numéro en dessous. La page où se trouve le curseur est entourée d'un cadre noir.
14. Un clic sur une miniature ferme la vue et amène à cette page, en haut de la feuille. **Échap** ou « Fermer » ferme
    la vue sans bouger.
15. Au clavier : les flèches passent d'une miniature à l'autre, Entrée y va.
16. Les miniatures sont en lecture seule, ne s'impriment pas et ne sont jamais enregistrées. Sur 100 pages, la vue
    s'ouvre en moins d'une seconde (seules les miniatures visibles sont dessinées).
17. L'aide (A1) explique les feuilles et la vue des pages.

## Tests attendus

- Playwright : même nombre de feuilles que de pages imprimées (texte long, tableau, image, saut de page, paysage) ;
  frappe et sélection à travers une coupure, document inchangé ; en-tête, pied de page et numéros sur chaque feuille,
  rien sur la première page si demandé ; aucun trait en pointillé ; plan et recherche amènent dans une feuille ;
  miniatures : ouverture, clic, Échap, clavier, cadre de la page courante ; document de 100 pages (délai de frappe et
  d'ouverture de la vue).
- Les tests de T2.8 sur les traits et les numéros dans la marge sont adaptés aux feuilles (critère 7).

## Vérification manuelle

1. Ouvrir un exposé de 5 pages : chaque page est une feuille séparée, avec son numéro, son en-tête et son pied de page.
2. Écrire au bas d'une feuille : le texte passe sur la feuille suivante, sans saut.
3. Imprimer en PDF : même nombre de pages, coupées aux mêmes endroits.
4. Ouvrir « Vue des pages », cliquer sur la page 4 : on y arrive. Échap ferme la vue.
5. Sur un document très long, la frappe reste fluide.
