# CLAUDE.md : Nano Buro

Lis ce fichier entièrement avant toute action.

Règles générales de travail (méthode, tests, Git, dépendances, commentaires,
format de réponse) : @docs/regles-de-travail.md
Ce fichier ne contient que ce qui est propre à Nano Buro.
En cas de contradiction, ce fichier l'emporte.

## Le projet

Nano Buro est un traitement de texte sobre, sans publicité ni assistant IA imposé.
C'est un **projet pilote destiné à un usage familial**, sur des ordinateurs Mac et Windows.
La collaboration en ligne viendra plus tard : elle n'est pas développée maintenant,
mais l'architecture doit la rendre possible sans réécriture.

## Stack technique

- **Application** : PWA (application web installable, fonctionne hors ligne)
- **Langage** : TypeScript en mode strict
- **Outils** : Vite, vite-plugin-pwa
- **Interface** : React
- **Éditeur** : Tiptap (basé sur ProseMirror). Ne jamais coder un éditeur de texte à la main.
- **Modèle de document** : Yjs, relié à Tiptap par l'extension de collaboration
- **Copie de secours** : stockage du navigateur (IndexedDB via y-indexeddb)
- **Correcteur orthographique** : celui du navigateur (attribut `spellcheck`)
- **Tests** : Vitest (logique), Playwright (interface, navigateur Chromium)
- **Qualité** : ESLint, Prettier, `tsc --noEmit`
- **Navigateurs cibles** : Chrome et Edge. Safari et Firefox doivent fonctionner en mode dégradé (voir Enregistrement).

Certaines extensions Tiptap sont payantes (« Pro ») : ne pas les utiliser sans validation.

Polices : seules des polices sous licence SIL Open Font License 1.1 (OFL) sont intégrées à l'application,
livrées avec elle et jamais chargées depuis un service en ligne. Cette licence est acceptée pour les polices
uniquement, en plus des licences des règles générales. Les polices du système (Arial, Corbel…) ne sont pas proposées :
elles ne s'affichent pas de la même façon sur Mac et sur Windows.

## Interface

La charte graphique `docs/design/README.md` et la maquette `docs/design/maquette/` font foi pour toute
l'interface. Tout ticket qui ajoute ou modifie un élément visible la respecte et réutilise les variables
CSS `--nano-…`. Un écart à la charte est une question pour le product owner, pas un choix du développeur.

## Règles produit (non négociables)

1. Aucune publicité, bannière ou invitation à payer. Aucun assistant IA imposé : l'assistant (T3.1) est facultatif, désactivé par défaut, et invisible tant qu'il est éteint.
2. Fonctionnement hors ligne. Aucune donnée de document n'est envoyée sur le réseau, sauf le texte sélectionné, envoyé à l'assistant IA choisi par l'utilisateur, avec sa propre clé, et seulement après un clic explicite (T3.1). Seuls les fichiers de l'application elle-même (mises à jour de la PWA) peuvent être téléchargés.
3. **Ne jamais perdre un document** : écriture atomique, copie de secours, alerte avant fermeture si des modifications ne sont pas enregistrées.
4. Le contenu du document vit dans un `Y.Doc` (Yjs).
5. Chaque bloc (paragraphe, titre, élément de liste, cellule) porte un identifiant stable, conservé après enregistrement et réouverture.
6. Aucune mise en forme automatique pendant la saisie dans le pilote (par exemple, `# ` ou `1. ` ne crée ni titre ni liste). Toute correction automatique ajoutée plus tard devra être désactivable, et Ctrl/Cmd+Z devra annuler une seule correction.

## Enregistrement des fichiers

- **Chrome et Edge** : API File System Access. « Enregistrer sous » demande l'emplacement une fois, puis « Enregistrer » (Ctrl/Cmd+S) réécrit le même fichier sans redemander.
- **Safari et Firefox** : repli sur le téléchargement, avec un message recommandant Chrome ou Edge.
- **Ouverture** : fonctionne dans tous les navigateurs.
- L'écriture se fait toujours via `createWritable()` puis `close()`, pour que le fichier soit remplacé d'un coup.

### Format de fichier `.nano`

Fichier JSON en UTF-8 :

- `format` : toujours `"nano-office"`
- `version` : entier, actuellement `2` (depuis T1.9 ; un fichier version 1 s'ouvre et est migré, voir `src/core/migrations.ts`)
- `id` : identifiant unique du document (UUID), créé avec le document et conservé à chaque enregistrement
- `content` : le document au format JSON de Tiptap (lisible, sert de secours)
- `ydoc` : l'état Yjs encodé en base64 (`Y.encodeStateAsUpdate`), sans le contenu des images
- `images` (version 2) : les images utilisées par le document, chacune une seule fois, sous l'empreinte SHA-256
  de son contenu : `{ "<empreinte>": { "type": "image/png", "data": "<base64>" } }`. `content` et `ydoc` n'en
  gardent que l'empreinte (attribut `hash` du nœud image). Une image retirée du document n'est plus enregistrée.

Dans l'application, les images vivent dans la `Y.Map` « images » du `Y.Doc`, donc dans la copie de secours.
Une référence sans image (fichier modifié à la main) s'affiche « Image manquante », sans bloquer l'ouverture.

À l'ouverture, `ydoc` est la source de vérité, vérifiée par `content` : s'ils diffèrent, utiliser `content`.
Si `content` est inutilisable, le fichier est refusé (`corrupted`), même si `ydoc` contient du texte :
rien ne permet plus de vérifier que `ydoc` est complet, et l'enregistrer écraserait l'original.
Une version inconnue ou un fichier invalide affiche un message clair, sans plantage.
Tout changement de format incrémente `version` et ajoute une migration testée.

INVARIANT : la copie de secours est rangée sous l'`id` du document. Ouvrir un fichier crée
un nouveau `Y.Doc` : on n'applique jamais l'état Yjs d'un fichier sur un `Y.Doc` déjà rempli,
car Yjs additionnerait les deux contenus au lieu de remplacer.

## Architecture

Arborescence de `src/` :

- `core/` : logique pure, sans React ni accès au navigateur (format de fichier, migrations, opérations sur le document)
- `storage/` : accès aux fichiers et au stockage de secours, derrière une interface
- `editor/` : configuration de Tiptap et de ses extensions
- `ui/` : composants React, sans logique métier
- `assistant/` : appels aux API d'assistant (Claude, Gemini), derrière une interface. Le seul code autorisé à envoyer du texte de document sur le réseau (règle produit 2, T3.1)

Règles d'import :

- `ui/` peut importer `editor/`, `storage/` et `core/`.
- `core/` n'importe rien d'autre que des bibliothèques.
- Aucun composant d'interface n'accède directement au disque : il passe par `storage/`.

Les types partagés sont dans `src/core/types.ts`.
Les tests sont dans `tests/`, avec la même arborescence (`tests/core/`, `tests/storage/`, `tests/e2e/`).

## Spécificités des tests

- Cas limites propres au projet : document vide, texte très long, accents, emojis, fichier `.nano` invalide.
- Les tests d'interface remplacent l'accès aux fichiers par une fausse implémentation de `FileStore`.
- Les vérifications manuelles se font sur un Mac avec Chrome et sur un PC Windows avec Edge.

## Suivi des tickets

- Chaque ticket a un fichier dans `tickets/` (la spécification, qui fait foi) et une Issue GitHub (le suivi), citée en tête du fichier.
- Le statut d'un ticket se lit sur le tableau Kanban du projet GitHub, pas dans le fichier.
- Un ticket n'est traité que lorsque le product owner le demande explicitement : le lancer vaut validation.
- La description de la PR qui livre un ticket contient `Closes #<numéro de l'Issue>`, pour fermer l'Issue à la fusion.
- Si un ticket est découpé ou créé, créer aussi son Issue, avec l'étiquette de tranche (`T0 squelette`, `T1 écrire au quotidien`…) et de taille (`taille S`, `taille M`).

### Lots

Les tickets sont livrés par lots, un lot par PR. La PR contient un `Closes #…` par ticket du lot.

| Lot | Tickets | Issues |
|---|---|---|
| **A. Mise en forme** | T1.1 titres, T1.2 listes, T1.3 alignement, T1.4 police et taille, T1.5 copier-coller | #8, #9, #10, #11, #12 |
| **B. Ne jamais perdre** | T1.6 sauvegarde automatique, puis PL3 se souvenir du fichier | #7, #38 |
| **C. Mise en forme (suite)** | T1.7 couleur et surlignage, T1.8 tableaux | #44, #45 |
| **D. Images** | T1.9 images, avec le format `.nano` version 2 | #46 |
| **E. Écrire plus vite** | T2.1 rechercher et remplacer, T2.2 interligne, T2.3 barré, T2.4 majuscules et minuscules | #55, #56, #57, #58 |
| **F. La page** | T2.5 page A4 et marges, T2.6 imprimer et PDF, T2.7 exporter en Word | #59, #60, #61 |
| **G. Assistant** | T3.1 assistant IA facultatif (corriger, traduire), avec choix des modifications | #66 |
| **H. Prêt pour la famille** | H3 fenêtre de mise à jour, A1 aide intégrée | #77, #78 |
| **I. Au quotidien** | T2.10 souligné, T2.11 compteur de mots, T2.12 liens, T2.13 exposant et indice, T2.14 retrait, T2.19 encadré | #84, #85, #86, #87, #88, #95 |
| **J. Documents complets** | T2.15 numéros de page, T2.16 en-tête et pied de page, T2.17 sommaire | #89, #90, #91 |
| **K. Ouvrir un fichier Word** | T2.18 ouvrir un `.docx` | #92 |
| **L. Schémas** | T2.20 schémas (processus, organigrammes), avec React Flow | #96 |

### Quand s'arrêter pour demander au product owner

Claude Code tranche seul les petites questions et les liste dans la PR (« Choix faits, à confirmer »).
Il s'arrête et demande seulement si la question :

1. peut faire perdre ou abîmer un document, ou réécrire un fichier sans que l'utilisateur l'ait voulu ;
2. change le format `.nano` ;
3. demande une dépendance hors des licences acceptées (MIT, Apache-2.0, BSD, ISC, Zlib, et OFL pour les polices) ;
4. s'écarte visiblement de la charte ou de la maquette (un nouvel écran, un nouvel élément sans modèle).

### Vérification et publication

Tant que la famille n'a pas l'adresse de l'application, la PR est fusionnée dès que la CI est verte (voir « Fusion des PR »),
et le product owner vérifie sur la version publiée (GitHub Pages), sur le Mac et le PC, sans Terminal. Un défaut se corrige
dans une PR suivante, ou par « Revert ». La PR donne une liste de vérification courte : 10 points au plus par lot.

### Fusion des PR

Depuis le 2026-10-24, le product owner délègue la fusion au **relecteur** (la session Claude chargée des relectures),
pas aux sessions qui développent. Le relecteur fusionne une PR, sans attendre le product owner, quand :

1. la CI est verte et la PR n'a pas de conflit ;
2. la relecture est faite et ne laisse aucun point bloquant ;
3. aucune question pour le product owner n'attend sa réponse, et aucun test existant n'a été changé sans son accord.

Exception : une PR qui **change le format `.nano`** ou la façon d'enregistrer les fichiers attend un « ok » du product owner
avant d'être fusionnée. Les PR de cadrage (tickets, règles, journal), écrites à partir de ses décisions, sont fusionnées
dès que leur CI est verte. Après chaque fusion, le relecteur vérifie la publication et dit au product owner ce qu'il
peut vérifier sur la version publiée. Une session de développement ne fusionne jamais elle-même.

## Relecture et échanges sur la PR

La PR est le lieu d'échange entre le développeur, le relecteur et le product owner.
Tout ce qui concerne un ticket y est écrit, pour que la session suivante le retrouve.

- **Au début d'une session sur une PR existante**, lire ses commentaires et ses relectures avant de toucher au code.
- **Répondre à chaque commentaire de relecture**, dans son fil : « Corrigé dans `<commit>` », ou la raison pour laquelle ce n'est pas fait.
- **Quand une série de corrections est poussée**, publier un commentaire de synthèse sur la PR : ce qui a été fait, résultat des tests, ce qui reste.
- **Mettre à jour la description de la PR** si le rapport de fin de ticket change (fichiers, tests, critères non satisfaits).
- Une question pour le product owner va dans un commentaire de la PR, pas seulement dans le fil de discussion de la session.

## Journal des décisions

- 2026-10-17 : Nom du produit : Nano Office (vérification INPI et EUIPO à faire).
- 2026-10-18 : Projet pilote familial, sur Mac et Windows.
- 2026-10-18 : PWA plutôt que Tauri : un seul code, pas d'installation, mises à jour automatiques. Tauri reste possible plus tard.
- 2026-10-18 : Chrome et Edge comme navigateurs cibles, pour enregistrer de vrais fichiers.
- 2026-10-18 : Yjs dès le départ pour préparer la collaboration, sans serveur pour l'instant.
- 2026-10-18 : Correcteur orthographique du navigateur pour le pilote.
- 2026-10-18 : Aucune mise en forme automatique pendant la saisie dans le pilote.
- 2026-10-18 : Code versionné sur GitHub. Documents de la famille sur un dossier synchronisé (OneDrive, Dropbox ou Google Drive), pas sur GitHub.
- 2026-10-18 : Règles générales de travail déplacées dans la mémoire utilisateur `~/.claude/CLAUDE.md`.
- 2026-10-18 : Champ `id` ajouté au format `.nano` v1, pour ranger la copie de secours par document et éviter que Yjs fusionne deux documents.
- 2026-10-18 : T0 découpé en T0a à T0e, car il dépassait la limite d'une journée ou de 400 lignes.
- 2026-10-18 : Le critère réseau porte sur les données de document, pas sur toute requête : la PWA doit pouvoir télécharger ses mises à jour.
- 2026-10-18 : Règles générales importées depuis `docs/regles-de-travail.md`, car les sessions Claude Code dans le cloud ne voient pas `~/.claude/CLAUDE.md`.
- 2026-10-18 : À la réouverture d'un fichier dont la copie de secours diffère, on demande à l'utilisateur s'il veut récupérer les modifications non enregistrées, plutôt que d'effacer la copie : ne jamais perdre un travail.
- 2026-10-18 : Raccourcis de titres : Cmd+Option+chiffre sur Mac, Ctrl+Shift+chiffre sur Windows, car Ctrl+Alt équivaut à AltGr sur un clavier AZERTY. Raccourcis reconnus à la touche physique (`event.code`).
- 2026-10-18 : Une Issue GitHub par ticket, suivie sur un tableau Kanban. Le fichier du ticket reste la spécification ; l'Issue porte le statut, pour n'avoir qu'une seule source pour chacun.
- 2026-10-18 : Un fichier au `content` inutilisable est refusé, même si son état Yjs contient du texte. Ouvrir un état Yjs non vérifiable risquerait d'écraser le fichier complet par une version partielle. Un futur mode récupération permettra de relire ces fichiers sans réécrire l'original.
- 2026-10-18 : `FileStore.open()` ne retient un fichier comme fichier courant que s'il est lisible, pour qu'Enregistrer ne puisse jamais réécrire un fichier refusé.
- 2026-10-18 : À l'ouverture, une copie de secours identique au fichier est effacée puis recréée à partir du fichier, car deux historiques Yjs au même contenu s'additionneraient.
- 2026-10-18 : Quand l'utilisateur accepte d'abandonner des modifications (Nouveau ou Ouvrir), le document n'est plus restauré au rechargement, mais sa copie de secours est gardée dans le navigateur : pas de retour surprise, et rien n'est perdu.
- 2026-10-18 : Une mise à jour de la PWA s'applique au lancement suivant, une fois toutes ses fenêtres fermées, et jamais en pleine édition (`registerType: "prompt"` sans message). Un message « mise à jour disponible » pourra venir plus tard.
- 2026-10-18 : Polices libres intégrées à l'application (IBM Plex Sans, Serif et Mono, Source Sans 3, EB Garamond) au lieu des polices du système, pour qu'un document s'affiche à l'identique sur Mac et sur Windows, et hors ligne. La licence SIL Open Font License est acceptée pour les polices. Corbel est écartée : sa licence interdit de l'intégrer, et elle manque sur Mac. Pour le Garamond, seule la version libre EB Garamond est retenue.
- 2026-10-19 : Charte graphique monochrome validée (maquette dans `docs/design/`). Elle s'applique avant la tranche T1 (ticket U1), pour que chaque nouvelle fonction arrive directement au bon style. Pas d'hébergement ni de partage avant une interface aboutie.
- 2026-10-19 : U1 découpé en U1a (structure et polices) et U1b (états et messages), car il dépassait 400 lignes. Le nom du document affiché est le nom du fichier sans `.nano`, le navigateur ne donnant pas son dossier.
- 2026-10-19 : L'application est renommée **Nano Buro** (deux majuscules, sans accent), avant tout partage avec la famille (ticket R1). Les identifiants techniques invisibles restent : format `nano-office` dans les fichiers, préfixe des copies de secours, extension `.nano`, dépôt GitHub. Ainsi, aucun fichier ni aucune copie existante ne devient illisible. La vérification du nom auprès de l'INPI et de l'EUIPO reste à faire.
- 2026-10-19 : Publication automatique sur GitHub Pages à chaque fusion sur `main` (ticket H1), pour tester sur le Mac et le PC sans Terminal. Publié ne veut pas dire partagé : l'adresse n'est donnée à la famille qu'une fois l'interface aboutie. Une nouvelle version s'applique d'elle-même au démarrage si l'utilisateur n'a pas encore commencé à travailler, sinon au lancement suivant ; pas de bandeau de mise à jour pour l'instant. La version (`v<date>·<commit>`) s'affiche sous le nom de l'application.
- 2026-10-19 : Nouvelle règle de découpage : un ticket = une intention que le product owner vérifie en une fois. On ne découpe que s'il mélange des sujets indépendants ou associe une zone à risque à autre chose ; la limite de 400 lignes est abandonnée, car un découpage trop fin multiplie les PR et les vérifications sans aider Claude Code.
- 2026-10-19 : T1.6 simplifié après U1b : la sauvegarde automatique est toujours active, sans réglage, et réutilise l'indicateur et les messages existants. Se souvenir du fichier après un redémarrage devient un ticket à part (PL3), pour ne pas mêler la mémoire des fichiers à la sauvegarde automatique.
- 2026-10-20 : Livraison par lots (A mise en forme, B ne jamais perdre) au lieu d'un ticket par PR, pour profiter de Claude Code et réduire les allers-retours. Claude Code tranche les petites questions et les liste dans la PR ; il ne s'arrête que dans quatre cas (perte de document, format `.nano`, licence, écart visible à la charte). Il se relit avant de signaler la PR. Le product owner fusionne quand la CI est verte et vérifie sur la version publiée, tant que la famille n'a pas l'adresse.
- 2026-10-20 : La branche est poussée avec une PR en brouillon dès le premier commit, puis après chaque ticket terminé : le travail d'une session n'est jamais seulement local, et le relecteur suit l'avancement.
- 2026-10-20 : La mise en forme du lot A enrichit le contenu du format .nano v1 sans en changer la structure ni la version.
- 2026-10-20 : La sauvegarde automatique n'écrase jamais un fichier modifié ailleurs (par exemple sur l'autre ordinateur, via le dossier synchronisé) : la date de modification du fichier, retenue à l'ouverture et après chaque écriture, est relue avant chaque sauvegarde automatique ; si elle a changé, rien n'est écrit, la sauvegarde automatique s'arrête et une alerte propose « Enregistrer sous… ». « Enregistrer » reste un choix explicite qui remplace le fichier. Ce n'est pas une gestion des conflits, seulement « ne jamais écraser sans prévenir ».
- 2026-10-20 : Couleur du texte, surlignage, tableaux et images ajoutés à la tranche T1 (lots C et D). Palettes de couleurs courtes et fixes ; les seules couleurs à l'écran sont celles du document. Les images sont rangées dans le fichier `.nano`, une seule fois chacune, et réduites à 2 000 px à l'insertion : le format passe en version 2, avec une migration testée depuis la version 1.
- 2026-10-21 : Un tableau collé avec le curseur dans une cellule devient du texte dans cette cellule : il n'écrase jamais les cellules voisines et ne coupe pas le tableau. Les tableaux ne s'imbriquent jamais. Depuis T1.8, un tableau collé depuis une autre application reste un tableau (le critère 4 de T1.5 est remplacé sur ce point).
- 2026-10-21 : Une restauration depuis la copie de secours ne compte plus comme travail commencé pour la mise à jour (ticket H2) : depuis le lot B, un document est restauré à chaque lancement, et la mise à jour était toujours reportée. Un document restauré est déjà en sécurité dans la copie de secours, et un rechargement le rouvre à l'identique.
- 2026-10-21 : Format `.nano` version 2 (T1.9) : les images sont rangées une seule fois dans le champ `images`, sous l'empreinte SHA-256 de leur contenu, et `content` comme `ydoc` n'en gardent que l'empreinte. Dans l'application, elles vivent dans la `Y.Map` « images » du Y.Doc, donc dans la copie de secours et, plus tard, dans la collaboration. Un fichier version 1 s'ouvre et s'enregistre en version 2. Les images restent hors des listes et des tableaux pour l'instant. Elles sont réduites à 1 600 px sur le grand côté, et une photo est réencodée en JPEG de qualité 0,8. Le champ `images` est trié par empreinte et placé en fin de fichier, pour qu'ajouter une image ne change pas le texte des autres et que le dossier synchronisé reste léger. Au-delà de 2 Mo enregistrés, la sauvegarde automatique est espacée (10 s après la dernière modification, 60 s au plus) ; la copie de secours reste immédiate.
- 2026-10-21 : Tranche T2 « aller plus loin », par ordre de priorité : lot E (rechercher et remplacer, interligne, barré, majuscules et minuscules), puis lot F (page A4 et marges, impression et PDF, export Word). L'impression et l'export, absents de la demande initiale, passent avant le pinceau et le tri des tableaux (PL4, PL5, plus tard), car sans eux un document ne peut pas être rendu ni envoyé. Les réglages de page sont des attributs du document, sans changement de version.
- 2026-10-21 : Lot E. La recherche surligne par des décorations, jamais dans le document. « Remplacer » ne repart pas au début après la dernière occurrence, pour qu'un remplacement qui contient le texte cherché ne boucle pas.
- 2026-10-21 : L'interligne est enregistré à la valeur de Word (`"1.15"`) dans l'attribut de bloc `lineHeight`, et affiché à 1,2 fois cette valeur, sans changement de version du format.
- 2026-10-21 : Mise en page (T2.5) rangée dans la `Y.Map` « page » du Y.Doc, car y-tiptap ignore les attributs du nœud `doc`. Dans le fichier, elle est écrite en attributs du nœud `doc` de `content`, sans changement de version. Le bouton « Mise en page… » est en fin de barre de mise en forme, pour que l'en-tête tienne sur une ligne.
- 2026-10-21 : La licence Zlib est ajoutée aux licences acceptées, pour tous les projets : elle est aussi permissive que MIT. Elle permet `pako`, utilisé par la bibliothèque `docx` de l'export Word (T2.7).
- 2026-10-21 : Assistant IA facultatif (T3.1, lot G, après le lot F). Les règles produit 1 et 2 sont modifiées : il est désactivé par défaut, invisible tant qu'il est éteint, et n'envoie que le texte sélectionné, après un clic, au fournisseur choisi (Claude ou Gemini), avec la clé d'API de l'utilisateur, gardée sur l'ordinateur et jamais dans un fichier. Chaque modification proposée s'accepte ou se refuse une par une, comme dans Cursor. Un abonnement claude.ai ou Gemini ne peut pas être relié à une autre application : il faut une clé d'API.
- 2026-10-21 : Repères de page (T2.8, option 1) : un trait en pointillé et le numéro de page dans la feuille continue, un compteur « Page 3 sur 7 » et un saut de page manuel (Ctrl/Cmd+Entrée), calculés avec les mêmes règles que l'impression. Des feuilles séparées comme dans Word (option 2) pourront venir plus tard. L'extension « Pages » de Tiptap est payante, donc exclue. Ordre : M1, T2.8, T2.9, puis le lot G.
- 2026-10-21 : Plan du document (T2.9) : on réorganise un document par parties (un titre et ce qui le suit), en les faisant glisser dans un panneau, comme dans le volet de navigation de Word, et non par pages, car le texte coule d'une page à l'autre. La vue de toutes les pages en miniatures, avec des feuilles séparées, vient plus tard (PL6).
- 2026-10-21 : Lot H « prêt pour la famille », à faire après M1 : une aide intégrée et hors ligne (A1), et une fenêtre « Nano Buro se met à jour » avec un N qui tourne, qui bloque l'application pendant la mise à jour au lancement (H3). Elle remplace la décision de H1 « pas de bandeau de mise à jour ». Elle ne s'affiche jamais une fois le travail commencé, et se débloque d'elle-même au bout de 20 s. Ordre : M1, lot H, T2.8, T2.9, puis le lot G.
- 2026-10-22 : L'assistant appelle les API de Claude et de Gemini par `fetch`, sans SDK : celui d'Anthropic entraîne une dépendance sous licence Unlicense (hors des licences acceptées), et celui de Google une vingtaine de paquets pour un seul appel. La section des Réglages s'appelle « Assistant IA », par transparence : on sait que le texte part chez un fournisseur d'IA. Elle n'apparaît que dans les Réglages, jamais dans la barre ni dans le document quand l'assistant est éteint.
- 2026-10-22 : Barre figée (M1) : l'en-tête, le message, la barre de mise en forme, la recherche et le panneau de l'assistant restent en haut de la fenêtre ; dans une fenêtre basse ou étroite, seuls le message et la barre. Le curseur et l'occurrence trouvée ne passent jamais dessous.
- 2026-10-23 : Lot H. La fenêtre « Nano Buro se met à jour » bloque la frappe ; le test H2 « frappe avant la prise de main » est adapté en conséquence, avec l'accord du PO, sans changer l'invariant vérifié. « Réglages » et « Aide » sont groupés dans l'en-tête. Dans l'aide, les messages sont repliés, et un clic les déplie.
- 2026-10-24 : Repères de page (T2.8) calculés à la largeur de la feuille imprimée, même dans une fenêtre plus étroite, pour que le nombre de pages soit toujours celui du PDF. Le pied de page reste en bas de la fenêtre pour montrer « Page 3 sur 7 ».
- 2026-10-24 : Un saut de page est un bloc du document, jamais dans une liste ni dans un tableau, comme une image. Il s'insère comme dans Word, avec Ctrl/Cmd+Entrée.
- 2026-10-24 : La fusion des PR est déléguée au relecteur, quand la CI est verte, la relecture sans point bloquant et aucune question en attente. Les PR qui changent le format `.nano` ou l'enregistrement attendent un « ok » du product owner. Les sessions de développement ne fusionnent jamais elles-mêmes. Le product owner vérifie ensuite sur la version publiée.
- 2026-10-24 : Après T2.9, lots I (souligné, compteur de mots, liens, exposant et indice, retrait), J (numéros de page, en-tête et pied de page, sommaire) et K (ouvrir un fichier Word, sans jamais le modifier). Notes de bas de page plus tard (PL7). Le souligné manquait depuis le lot A.
- 2026-10-24 : **Avant de commencer la collaboration en ligne**, le relecteur demande au product owner ses idées d'améliorations, et elles sont traitées d'abord : la collaboration ne commence pas sans cette étape.
- 2026-10-24 : Encadré (T2.19, lot I) : un bloc qui contient des paragraphes, et non une forme posée sur le texte. Schémas (T2.20, lot L, après le lot K) : un bloc modifiable dans le document, avec React Flow (MIT), des formes et des flèches reliées, rendu en SVG et exporté dans Word comme une image. Les formes flottantes à la Word, Excalidraw et tldraw (licence non libre) sont écartés.
- 2026-10-24 : Plan du document (T2.9). Seuls les titres placés directement dans le document forment une partie, pas ceux d'un tableau. Au clavier (Alt+Shift+Flèche, aussi depuis un titre du document quand le plan est ouvert), une sous-partie ne quitte jamais sa partie parente ; à la souris, elle peut en changer, comme dans Word. Le plan ouvert ou fermé est retenu sur l'ordinateur, jamais dans le fichier ; sous 1 140 px de large, il passe par-dessus la page.
- 2026-10-24 : Taille des fichiers : un fichier traite d'un seul sujet, et on le découpe au-delà d'environ 500 lignes ou s'il mélange plusieurs sujets. La limite de 300 lignes est abandonnée : prudente pour un humain, elle ne l'est pas pour Claude Code, et ce qui compte est qu'un fichier ait un seul sujet.
- 2026-10-24 : Lot I. Le souligné, l'exposant et l'indice sont des marques ; le retrait (1,25 cm par niveau, 5 au plus) et l'encadré (3 styles) sont des attributs ou des blocs du document, sans changement de version. Un lien ne s'ouvre qu'au Ctrl/Cmd+clic ou par « Ouvrir », jamais d'un simple clic, et seules les adresses http, https et mailto sont acceptées. Le compteur de mots compte les mots séparés par des espaces, comme Word. Les tests de l'ordre de la barre (barré, couleur) sont adaptés au bouton Souligné, avec l'accord du PO.
