# T0 : Squelette de bout en bout

**Statut** : à valider par le product owner
**Branche** : `ticket/T0-squelette`

## Besoin utilisateur

En tant que membre de la famille, je veux écrire un texte simple, l'enregistrer
dans un fichier et le rouvrir plus tard, sans jamais perdre ce que j'ai écrit.

## Périmètre

- Projet Vite + React + TypeScript strict, configuré en PWA
- Éditeur Tiptap relié à un `Y.Doc`
- Gras, italique, annuler et rétablir
- Nouveau, Ouvrir, Enregistrer, Enregistrer sous
- Format de fichier `.nano` version 1
- Copie de secours dans le navigateur
- Outillage : ESLint, Prettier, Vitest, Playwright

## Interfaces attendues

Elles servent de contrat pour écrire les tests avant le code. Les noms peuvent
être ajustés s'il y a une bonne raison, à signaler dans la réponse.

Dans `src/core/fileFormat.ts` (logique pure, sans navigateur) :

- `serializeDocument(ydoc: Y.Doc, content: JSONContent): string`
- `parseDocument(text: string): ParseResult`
  - succès : `{ ok: true, ydoc: Y.Doc, version: number }`
  - échec : `{ ok: false, error: "invalid-json" | "not-nano" | "unsupported-version" | "corrupted" }`

Dans `src/storage/fileStore.ts` :

- interface `FileStore` :
  - `open(): Promise<{ name: string; text: string } | null>` (null si l'utilisateur annule)
  - `save(text: string): Promise<SaveResult>` (réécrit le fichier courant, ou se comporte comme `saveAs` s'il n'y en a pas)
  - `saveAs(text: string, suggestedName: string): Promise<SaveResult>`
  - `canSaveInPlace(): boolean` (vrai si l'API File System Access est disponible)
- deux implémentations : `FileSystemAccessStore` (Chrome, Edge) et `DownloadStore` (repli)

Les tests d'interface peuvent remplacer `FileStore` par une fausse implémentation.

## Critères d'acceptation

**Application**

1. `npm run dev` lance l'application, `npm run build` produit une version installable (manifeste et service worker).
2. Après un premier chargement, l'application s'ouvre et fonctionne sans connexion internet.
3. Aucune requête réseau n'est faite pendant l'édition, l'ouverture ou l'enregistrement.

**Édition**

4. On peut saisir du texte sur plusieurs paragraphes.
5. Le bouton Gras et Ctrl/Cmd+B mettent la sélection en gras. Un second appui retire le gras.
6. Le bouton Italique et Ctrl/Cmd+I font de même pour l'italique.
7. Ctrl/Cmd+Z annule la dernière modification, Ctrl/Cmd+Shift+Z (et Ctrl+Y sous Windows) la rétablit.
8. Le contenu de l'éditeur est stocké dans un `Y.Doc`.
9. Chaque paragraphe porte un identifiant stable, identique après enregistrement et réouverture.
10. Le correcteur orthographique du navigateur est actif dans l'éditeur.

**Fichiers**

11. « Nouveau » ouvre un document vide. S'il y a des modifications non enregistrées, une confirmation est demandée.
12. « Enregistrer sous » propose le nom `document.nano` et laisse choisir l'emplacement.
13. Sur Chrome et Edge, après un premier enregistrement, « Enregistrer » et Ctrl/Cmd+S réécrivent le même fichier sans rien demander.
14. Sur Safari et Firefox, « Enregistrer » télécharge le fichier et affiche un message recommandant Chrome ou Edge.
15. « Ouvrir » charge un fichier `.nano` dans tous les navigateurs.
16. Enregistrer puis rouvrir redonne exactement le même contenu : texte, gras, italique, paragraphes, accents et emojis.
17. Un fichier d'une version inconnue, un JSON invalide ou un fichier qui n'est pas un `.nano` affiche un message clair en français, sans plantage, et le document en cours reste intact.
18. Le titre de la fenêtre indique le nom du fichier, avec un repère (par exemple `•`) s'il y a des modifications non enregistrées.

**Protection du travail**

19. Chaque modification est copiée dans le stockage du navigateur.
20. Après rechargement de la page ou fermeture brutale, le dernier contenu est restauré, avec un message indiquant qu'il s'agit d'une récupération.
21. Fermer l'onglet avec des modifications non enregistrées dans le fichier déclenche l'alerte du navigateur.

## Tests attendus

- **Vitest** : `fileFormat` (aller-retour, version inconnue, JSON invalide, fichier étranger, `ydoc` corrompu avec repli sur `content`, document vide, texte très long, accents, emojis).
- **Vitest** : identifiants de paragraphes conservés après l'aller-retour.
- **Playwright (Chromium)** : saisie, gras, italique, annuler et rétablir, nouveau document, enregistrement et ouverture avec une fausse implémentation de `FileStore`, récupération après rechargement, absence de requêtes réseau.

## Hors périmètre

Titres, listes, alignement, polices, tableaux, export PDF, impression, import `.docx`,
réglages, mise en page en pages, synchronisation, collaboration, Tauri, design soigné.
Une interface simple et lisible suffit.

## Vérification manuelle (par le product owner)

Sur un Mac avec Chrome, puis sur un PC Windows avec Edge :

1. Installer l'application depuis le navigateur.
2. Écrire quelques lignes avec du gras, de l'italique, des accents et un emoji.
3. Enregistrer dans un dossier, modifier, appuyer sur Ctrl/Cmd+S, fermer, rouvrir le fichier.
4. Couper le wifi, relancer l'application, vérifier qu'elle s'ouvre.
5. Écrire sans enregistrer, recharger la page, vérifier la récupération.
6. Ouvrir sur le PC un fichier créé sur le Mac.
