# PL4 : Reproduire la mise en forme (pinceau)

**Suivi** : Issue [#62](https://github.com/HnaoAI/nano-office/issues/62), le statut se lit sur le tableau Kanban
**Taille estimée** : M
**Lot** : N. Comme dans Word (avec PL6), à faire en premier

## User story

En tant que membre de la famille, je veux copier la mise en forme d'un texte vers un autre,
afin de ne pas refaire à la main police, taille, couleur et gras.

## Décisions du product owner (2026-11-06)

- Comme dans Word : **un clic** sur le pinceau sert une fois, **un double clic** le garde actif jusqu'à Échap.
- Le pinceau copie la mise en forme **du texte et du paragraphe**, mais pas le niveau de titre.
- **Bouton seulement, sans raccourci** : Ctrl/Cmd+Shift+V garde son rôle de collage du texte seul (T1.5).

## Critères d'acceptation

1. Un bouton **« Reproduire la mise en forme »** (icône de pinceau au trait, au style des autres boutons) est placé dans
   la barre, juste après « Annuler » et « Rétablir ». Il est enfoncé (`aria-pressed`) tant que le pinceau est actif.
2. La mise en forme copiée est celle du **curseur**, ou du **début de la sélection**, au moment du clic sur le bouton.
3. Ce qui est copié :
   - pour le texte : gras, italique, souligné, barré, exposant et indice, couleur, surlignage, police et taille ;
   - pour le paragraphe : alignement, interligne et retrait.
   Ce qui n'est **pas** copié : niveau de titre, liste, encadré, lien, et le texte lui-même.
4. Le pinceau **remplace** la mise en forme de la cible, comme Word : une marque absente de la source est retirée de la
   cible (copier un texte normal sur un texte en gras retire le gras).
5. Pinceau actif, une sélection **à la souris** (glisser, double clic, triple clic) reçoit la mise en forme quand le
   bouton est lâché. Un simple clic dans un mot l'applique à tout ce mot. Les paragraphes touchés reçoivent
   l'alignement, l'interligne et le retrait.
6. **Un clic** sur le bouton : le pinceau s'éteint après une application. **Double clic** : il reste actif pour
   plusieurs applications, jusqu'à **Échap** ou un nouveau clic sur le bouton.
7. Chaque application est **une seule étape** d'annulation (Ctrl/Cmd+Z).
8. Le pinceau marche dans un tableau, un encadré, une liste et un titre (sans en changer le niveau). Sur une image, un
   schéma, un saut de page ou un sommaire, il ne fait rien.
9. Pendant que le pinceau est actif, le pointeur de la souris montre un pinceau au-dessus du texte du document.
10. Rien n'est enregistré dans le fichier en dehors de la mise en forme appliquée ; le format `.nano` ne change pas.
11. L'aide (A1) explique le pinceau, avec le simple et le double clic.

## Tests attendus

- Vitest : calcul des marques et des attributs copiés, remplacement (marque absente retirée), titres et listes laissés.
- Playwright : un clic puis une sélection applique et éteint ; un double clic reste actif jusqu'à Échap ; un simple
  clic dans un mot ; une étape d'annulation ; tableau et liste ; image et schéma ignorés ; le bouton reflète l'état.
- Cas limites : source sans mise en forme, accents et emojis, sélection sur plusieurs paragraphes.

## Vérification manuelle

1. Mettre un mot en rouge, gras, 16 et EB Garamond, y placer le curseur, cliquer sur le pinceau, puis sélectionner un
   autre mot : il prend toute cette mise en forme, et le pinceau s'éteint.
2. Double-cliquer sur le pinceau, l'appliquer à trois mots, puis Échap.
3. Copier un paragraphe centré, en interligne 1,5, sur un paragraphe aligné à gauche : il devient centré, en 1,5.
4. Ctrl/Cmd+Z annule une application à la fois.
