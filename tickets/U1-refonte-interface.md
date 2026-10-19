# U1 : Refonte de l'interface selon la charte

**Suivi** : Issue [#24](https://github.com/HnaoAI/nano-office/issues/24), le statut se lit sur le tableau Kanban
**Dépend de** : T0 (T0a à T0e)
**Taille estimée** : M
**Branche** : `ticket/U1-refonte-interface`

## User story

En tant que membre de la famille, je veux une application belle et claire, qui donne envie d'écrire,
afin d'utiliser Nano Office avec plaisir plutôt que par obligation.

## Référence

La charte `docs/design/README.md` et la maquette `docs/design/maquette/` font foi. Ce ticket applique
cette charte **aux fonctions qui existent déjà** (T0). Les éléments de la maquette qui appartiennent
à T1 (titres, polices, tailles, alignement, listes) ne sont pas ajoutés ici : chaque ticket T1 les
ajoutera dans la barre, au même style.

## Critères d'acceptation

**Structure**

1. L'en-tête contient, de gauche à droite : le logo et le nom « Nano Office », le nom du document
   et le nom du fichier, l'indicateur d'enregistrement, puis le groupe Fichier (Nouveau, Ouvrir…,
   Enregistrer sous…, Enregistrer). « Enregistrer » est le bouton principal, avec le raccourci affiché
   (⌘S sur Mac, Ctrl+S sur Windows).
2. Pour un document jamais enregistré, l'en-tête affiche « Sans titre » et aucun nom de fichier.
3. La barre de mise en forme est une barre flottante centrée sous l'en-tête : Annuler, Rétablir,
   séparateur, Gras, Italique. Gras et Italique activés sont sur fond noir, texte blanc.
4. Le document s'affiche comme une page blanche centrée, d'au plus 794 px de large, avec l'ombre de la
   charte, sur le fond gris de l'application.
5. Le pied de page affiche « Copie de secours à jour » quand la copie de secours est reliée,
   et « Fonctionne hors ligne ».

**États et messages**

6. L'indicateur affiche « Enregistré » ou « Non enregistré » selon l'état réel du document, avec le
   style de la charte. L'état « Enregistrement… » s'affiche pendant une écriture.
7. Les messages existants (document récupéré, téléchargement sur Safari et Firefox, fichier abîmé,
   fichier illisible, échec d'enregistrement) prennent le style de la charte : information sur fond
   blanc, alerte sur fond noir. Leurs textes ne changent pas.
8. Chaque message a un bouton de fermeture. Le message « document récupéré » propose aussi
   « Enregistrer sous… », et l'échec d'enregistrement aussi.
9. La question de la copie de secours s'affiche en boîte de dialogue centrée, au-dessus de la page
   estompée, avec le nom du fichier et les deux boutons de la maquette.

**Polices et qualité**

10. IBM Plex Sans et IBM Plex Mono sont **intégrées à l'application** (fichiers `.woff2` d'un paquet
    npm, par exemple Fontsource), alphabet latin seulement. Aucune police n'est chargée depuis Google
    Fonts ou un autre service. `woff2` est ajouté aux `globPatterns` de workbox : les polices
    s'affichent hors ligne.
11. Les noms accessibles des boutons ne changent pas (« Gras », « Italique », « Annuler »,
    « Rétablir », « Nouveau », « Ouvrir… », « Enregistrer », « Enregistrer sous… »), même quand le
    bouton affiche une icône ou une lettre. Les boutons à icône seule ont un `aria-label`.
12. Tous les tests existants passent **sans modification de leurs assertions**. Si un sélecteur doit
    changer, le signaler dans la PR et garder le même comportement vérifié.
13. À 390 px de large, rien ne déborde horizontalement : l'en-tête et la barre passent à la ligne.
14. Les couleurs, rayons et ombres viennent de variables CSS uniques (`--nano-…`), définies une seule
    fois, pour que les tickets suivants les réutilisent.

## Note technique

- Les styles restent dans `src/ui/styles.css` (ou un dossier `src/ui/styles/` si le fichier dépasse
  300 lignes). Pas de bibliothèque de composants ni de framework CSS.
- Les icônes sont du SVG en ligne dans un petit module `src/ui/icons.tsx`, pas une bibliothèque d'icônes.
- La maquette charge Google Fonts pour l'affichage seulement : ne pas recopier ces `<link>`.
- Dépendances : seulement les paquets de polices (licence OFL, acceptée pour les polices).

## Tests attendus

- Playwright : présence et ordre des éléments de l'en-tête, « Sans titre » pour un nouveau document,
  état de l'indicateur après une modification puis après un enregistrement, fermeture d'un message,
  boîte de dialogue de récupération, aucune requête vers un autre domaine pour les polices, absence
  de défilement horizontal à 390 px.
- Les tests existants restent inchangés (critère 12).

## Hors périmètre

Fonctions de T1 (titres, listes, alignement, polices et tailles du document, copier-coller, sauvegarde
automatique), mode sombre, logo définitif, nouvelles icônes d'application, animations.

## Vérification manuelle

Sur le Mac avec Chrome, comparer l'application à la maquette, écran par écran : éditeur, document
récupéré, question de récupération, fichier abîmé. Réduire la fenêtre à la largeur d'un téléphone.
Couper le wifi et vérifier que les polices restent les mêmes.
