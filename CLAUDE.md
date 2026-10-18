# CLAUDE.md : Nano Office

Lis ce fichier entièrement avant toute action.

Règles générales de travail (méthode, tests, Git, dépendances, commentaires,
format de réponse) : @docs/regles-de-travail.md
Ce fichier ne contient que ce qui est propre à Nano Office.
En cas de contradiction, ce fichier l'emporte.

## Le projet

Nano Office est un traitement de texte sobre, sans publicité ni assistant IA imposé.
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

## Règles produit (non négociables)

1. Aucune publicité, bannière, bouton IA ou invitation à payer.
2. Fonctionnement hors ligne. Aucune donnée de document n'est envoyée sur le réseau. Seuls les fichiers de l'application elle-même (mises à jour de la PWA) peuvent être téléchargés.
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
- `version` : entier, actuellement `1`
- `id` : identifiant unique du document (UUID), créé avec le document et conservé à chaque enregistrement
- `content` : le document au format JSON de Tiptap (lisible, sert de secours)
- `ydoc` : l'état Yjs encodé en base64 (`Y.encodeStateAsUpdate`)

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
- 2026-10-18 : Polices libres intégrées à l'application (IBM Plex Sans, Serif et Mono, Source Sans 3, EB Garamond) au lieu des polices du système, pour qu'un document s'affiche à l'identique sur Mac et sur Windows, et hors ligne. La licence SIL Open Font License est acceptée pour les polices. Corbel est écartée : sa licence interdit de l'intégrer, et elle manque sur Mac. Pour le Garamond, seule la version libre EB Garamond est retenue.
