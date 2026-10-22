# H3 : Fenêtre « Nano Buro se met à jour », avec un N qui tourne

**Suivi** : Issue [#77](https://github.com/HnaoAI/nano-office/issues/77), le statut se lit sur le tableau Kanban
**Dépend de** : H2, M1
**Taille estimée** : S
**Lot** : H. Prêt pour la famille

## User story

En tant que membre de la famille, je veux voir que Nano Buro se met à jour, et ne pas pouvoir commencer à écrire
pendant ce temps, afin de comprendre pourquoi la page se recharge et de ne rien taper pour rien.

## Décision du product owner (2026-10-21)

Elle remplace la décision de H1 « pas de bandeau de mise à jour ». Une fenêtre s'affiche pendant la mise à jour au
lancement, avec une petite animation : un N majuscule qui tourne sur lui-même. Nano Buro est bloqué jusqu'à la fin.

## Critères d'acceptation

1. Quand une nouvelle version est prête et que la mise à jour au lancement est décidée (règles de H1 et H2 :
   rien n'est commencé), une fenêtre s'affiche **avant le rechargement** et reste jusqu'à ce que la nouvelle version
   soit affichée.
2. La fenêtre est centrée, au style de la boîte de dialogue de la charte, sur la page estompée. Elle contient :
   - un **N majuscule** en IBM Plex Sans 600, d'environ 48 px, couleur d'encre, qui **tourne sur lui-même** autour
     de son axe vertical (rotation 3D `rotateY`, un tour en 1,6 s environ, en continu) ;
   - « Nano Buro se met à jour… » ;
   - en dessous, en texte discret : « Vos documents ne sont pas touchés. Cela prend quelques secondes. »
3. **Pendant ce temps, Nano Buro est bloqué** : ni clic, ni frappe, ni raccourci (Ctrl/Cmd+S, P, F…) n'atteignent
   l'éditeur ou les boutons. Le focus est dans la fenêtre, et le reste de la page est inerte (`inert`).
4. La fenêtre ne s'affiche **jamais une fois le travail commencé** : dans ce cas, la règle de H1 ne change pas, la mise
   à jour attend le lancement suivant, et rien ne bloque l'utilisateur.
5. **Jamais bloqué pour toujours** : si la nouvelle version n'est pas affichée au bout de 20 secondes (service worker
   bloqué, hors ligne pendant le téléchargement), la fenêtre se ferme, Nano Buro se débloque avec la version actuelle,
   et la mise à jour attend le lancement suivant. Une seule tentative par lancement (H1).
6. Après le rechargement, un message d'information discret indique « Nano Buro a été mis à jour (v…) », avec son
   bouton de fermeture. Il disparaît seul à la première frappe.
7. Si le système demande moins d'animations (`prefers-reduced-motion`), le N ne tourne pas. Il pulse doucement
   en opacité, ou reste fixe.
8. La fenêtre est accessible : `role="alertdialog"`, `aria-busy="true"`, et un texte lu par les lecteurs d'écran.
9. Le document restauré (H2) revient à l'identique après le rechargement, avec son fichier retenu et son message.

## Tests attendus

- Vitest : la décision « afficher la fenêtre » (seulement si `decideUpdate` dit `reload`) et le délai de 20 s,
  avec une horloge simulée.
- Playwright, avec la mise à jour simulée de H2 :
  - la fenêtre s'affiche et bloque la frappe et les clics ;
  - la nouvelle version s'affiche ensuite, avec le message ;
  - pas de fenêtre si une frappe a eu lieu ;
  - déblocage au bout de 20 s si rien ne se passe ;
  - avec `reducedMotion: "reduce"`, le N ne tourne pas.

## Vérification manuelle

Après une fusion, ouvrir Nano Buro sans rien taper : la fenêtre au N qui tourne s'affiche, puis la nouvelle version,
avec le message « mis à jour ».
