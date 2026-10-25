# B3 : Impression : en-tête imprimé en double, numéros de page absents

**Suivi** : Issue [#107](https://github.com/HnaoAI/nano-office/issues/107), le statut se lit sur le tableau Kanban
**Dépend de** : lot J (T2.15, T2.16)
**Taille estimée** : S
**Lot** : correction seule, à faire avant le lot K

## Constat du product owner (2026-10-25), PDF imprimé depuis Chrome sur le Mac

Document : un en-tête « test 😊 », un Titre 1 « Partie 1 », du texte. « Numéroter les pages » coché, en bas à droite,
et « Pas de numéro sur la première page » coché.

1. **En-tête en double** : il s'imprime en haut de la page, à sa place, **et une seconde fois dans le texte**, sous
   « Partie 1 », en petits caractères gris. C'est le calque d'affichage à l'écran (`HeaderFooterLayer`), placé près
   des repères de page, qui n'est pas masqué à l'impression.
2. **Numéros absents** : la page 1 montre en bas l'adresse de l'application et un numéro, qui viennent de l'option
   « En-têtes et pieds de page » de Chrome. Sur les pages suivantes, le pied de page de Chrome disparaît (Nano Buro
   occupe la zone de marge), mais **aucun numéro de Nano Buro ne s'affiche**. Les zones de marge `@page`
   (`@bottom-right` et `counter(page)`) ne produisent donc pas de numéro dans Chrome, ou sont vides.

## Critères d'acceptation

1. À l'impression et dans le PDF, l'en-tête et le pied de page n'apparaissent **qu'une fois par page**, dans la marge.
   Le calque d'écran est masqué en `@media print`, avec un test d'impression (`page.pdf()` ou `emulateMedia`) qui
   vérifie que le texte de l'en-tête n'apparaît qu'une fois par page.
2. Avec « Numéroter les pages », chaque page porte son numéro à la position choisie. Avec « Pas de numéro sur la
   première page », seule la page 1 n'en a pas. Le test vérifie le **contenu du PDF** produit par Chromium (texte des
   pages, par exemple avec `pdfjs-dist` en développement, sous licence acceptée), et non seulement la présence d'une
   règle CSS.
3. Si les zones de marge `@page` ne sont pas assez fiables dans Chrome et Edge, choisir une autre méthode qui marche
   dans les deux, expliquer le choix dans la PR et le signaler au relecteur.
4. L'aide (A1) rappelle de décocher « En-têtes et pieds de page » de Chrome, qui ajoute l'adresse et la date. Elle le
   dit déjà : vérifier que ce rappel est bien visible dans la section « Imprimer, PDF et Word ».
5. Rien ne change à l'écran : le calque d'en-tête et de pied de page reste affiché en gris clair.

## Vérification manuelle

Refaire le document du constat, imprimer en PDF avec « En-têtes et pieds de page » décoché dans Chrome : en-tête une fois
en haut de chaque page, numéros sur les pages 2 et suivantes, rien en page 1.
