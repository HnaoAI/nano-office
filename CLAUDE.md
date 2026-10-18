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

À l'ouverture, `ydoc` est la source de vérité. Si `ydoc` est illisible, utiliser `content`.
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
