# A1 : Aide intégrée à Nano Buro

**Suivi** : Issue [#78](https://github.com/HnaoAI/nano-office/issues/78), le statut se lit sur le tableau Kanban
**Dépend de** : M1
**Taille estimée** : M
**Lot** : H. Prêt pour la famille

## User story

En tant que membre de la famille, je veux trouver dans Nano Buro une aide simple,
afin de savoir l'installer, où ranger mes documents et quoi faire si un message apparaît, sans appeler Hicham.

## Critères d'acceptation

1. Un bouton « Aide » (icône « ? » au trait) au bout de l'en-tête, et le raccourci Ctrl/Cmd+/, ouvrent un panneau
   d'aide à droite de la page. Échap ou le bouton de fermeture le ferment. À petite largeur, il occupe tout l'écran.
2. L'aide est **intégrée à l'application** et s'affiche **hors ligne**. Elle n'ouvre aucune page web et ne charge rien
   sur le réseau.
3. Sommaire cliquable, avec une section par sujet, dans cet ordre :
   1. **Installer Nano Buro** sur le Mac (Chrome) et sur le PC (Edge), avec l'icône d'installation de la barre d'adresse.
   2. **Où ranger ses documents** : dans le dossier synchronisé (OneDrive, Dropbox ou Google Drive), pour les retrouver
      sur un autre ordinateur. Expliquer « Enregistrer sous… » une fois, puis l'enregistrement automatique.
   3. **Ne rien perdre** : la pastille « Enregistré », la sauvegarde automatique, la copie de secours du navigateur,
      et ce qui se passe si l'on ferme sans enregistrer.
   4. **Les messages et quoi faire** : document récupéré, fichier modifié ailleurs, autorisation à redonner, fichier abîmé,
      fichier d'une version plus récente, échec d'enregistrement. Pour chacun, la phrase affichée, puis « que faire ».
   5. **Mettre en forme** : titres, listes, couleurs, tableaux, images, interligne, mise en page.
   6. **Imprimer, PDF et Word**, avec la case « En-têtes et pieds de page » du navigateur à décocher.
   7. **Raccourcis clavier** : un tableau qui affiche les touches de l'ordinateur utilisé (⌘ et ⌥ sur Mac, Ctrl et Shift
      sur PC), à partir de la même liste que les raccourcis réels, pour qu'ils ne divergent jamais.
   8. **Mises à jour** : automatiques à l'ouverture, avec la fenêtre « se met à jour » (H3), et le numéro de version
      affiché sous le nom.
   9. **Confidentialité** : les documents restent sur l'ordinateur, et rien n'est envoyé sur Internet. Ajouter
      l'assistant IA facultatif quand le lot G sera fait.
4. Les phrases des messages citées dans l'aide sont **les mêmes** que dans l'application. Un test vérifie qu'elles
   viennent des mêmes constantes (`fileMessages.ts` et les autres).
5. Chaque section tient sur un écran, en phrases courtes, sans jargon technique (pas de « PWA », de « Yjs » ni
   d'« IndexedDB »), et au vouvoiement, comme les messages de l'application.
6. L'aide ne s'imprime pas avec le document et n'est jamais enregistrée dedans.
7. Le numéro de version et le lien vers l'adresse de l'application figurent en bas de l'aide.

## Charte

Panneau au style du plan (T2.9) : surface blanche, ombre de la barre de mise en forme, titres en 15 px (600),
texte en 14 px, raccourcis dans des pastilles `#F3F3F1` en IBM Plex Mono 12 px. Aucune image extérieure. Les captures
d'écran sont remplacées par les icônes de l'application, au trait.

## Note technique

Contenu dans un module de `src/ui/help/` (texte en français, données structurées), pour que le product owner puisse le
relire et le corriger facilement dans la PR. Aucune dépendance de rendu Markdown.

## Hors périmètre

Recherche dans l'aide, vidéos, aide en ligne, visite guidée au premier lancement.

## Vérification manuelle

Lire toute l'aide sur le Mac et le PC, vérifier que les raccourcis affichés sont ceux de l'ordinateur, couper le
wifi et rouvrir l'aide.
