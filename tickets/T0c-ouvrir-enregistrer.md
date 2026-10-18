# T0c : Ouvrir et enregistrer

**Statut** : à valider par le product owner
**Dépend de** : T0b
**Taille estimée** : M
**Branche** : `ticket/T0c-ouvrir-enregistrer`

## Besoin utilisateur

En tant que membre de la famille, je veux enregistrer mon texte dans un fichier
et le rouvrir plus tard, sur le Mac comme sur le PC.

## Interfaces attendues

Dans `src/storage/fileStore.ts` :

- interface `FileStore` :
  - `open(): Promise<{ name: string; text: string } | null>` (null si l'utilisateur annule)
  - `save(text: string): Promise<SaveResult>` (réécrit le fichier courant, ou se comporte comme `saveAs` s'il n'y en a pas)
  - `saveAs(text: string, suggestedName: string): Promise<SaveResult>`
  - `canSaveInPlace(): boolean` (vrai si l'API File System Access est disponible)
  - `forget(): void` (oublie le fichier courant, utilisé par « Nouveau »)
- deux implémentations : `FileSystemAccessStore` (Chrome, Edge) et `DownloadStore` (repli)
- `FileSystemAccessStore.open()` utilise le sélecteur de l'API File System Access (`showOpenFilePicker`)
  et garde la poignée du fichier ouvert comme fichier courant

Les tests d'interface remplacent `FileStore` par une fausse implémentation.

## Critères d'acceptation

1. « Nouveau » ouvre un document vide avec un nouvel `id`. S'il y a des modifications non enregistrées, une confirmation est demandée.
2. Après « Nouveau », le fichier courant est oublié : « Enregistrer » sur le nouveau document demande un emplacement.
3. « Enregistrer sous » propose le nom `document.nano` et laisse choisir l'emplacement.
4. Sur Chrome et Edge, après un premier enregistrement, « Enregistrer » et Ctrl/Cmd+S réécrivent le même fichier sans rien demander.
5. Sur Chrome et Edge, « Ouvrir » utilise le sélecteur de l'API File System Access. Ensuite, « Enregistrer » et Ctrl/Cmd+S réécrivent directement le fichier ouvert. Le navigateur peut demander une fois l'autorisation d'écrire dans ce fichier.
6. Ctrl/Cmd+S n'ouvre jamais la fenêtre « Enregistrer la page » du navigateur, que le curseur soit dans l'éditeur ou non.
7. L'écriture passe par `createWritable()` puis `close()`, pour que le fichier soit remplacé d'un coup.
8. Sur Safari et Firefox, « Enregistrer » télécharge le fichier et affiche un message recommandant Chrome ou Edge.
9. « Ouvrir » charge un fichier `.nano` dans tous les navigateurs, dans un nouveau `Y.Doc`, sans mélange avec le document précédent.
10. Après « Ouvrir » ou « Nouveau », Ctrl/Cmd+Z n'agit jamais sur le document précédent : l'historique d'annulation repart de zéro.
11. Enregistrer puis rouvrir redonne exactement le même contenu : texte, gras, italique, paragraphes, accents et emojis.
12. Un fichier d'une version inconnue, un JSON invalide ou un fichier qui n'est pas un `.nano` affiche un message clair en français, sans plantage, et le document en cours reste intact.
13. Le titre de la fenêtre indique le nom du fichier, avec un repère (par exemple `•`) s'il y a des modifications non enregistrées.

## Note technique

L'extension de collaboration de Tiptap se lie à un seul `Y.Doc`, au moment où l'éditeur est créé.
« Ouvrir » et « Nouveau » recréent donc l'éditeur avec le nouveau `Y.Doc`, et le gestionnaire d'annulation
de Yjs avec lui. Sans cela, Ctrl/Cmd+Z pourrait modifier l'ancien document.

Le raccourci Ctrl/Cmd+S est intercepté au niveau de la page (`preventDefault`), pas seulement dans l'éditeur.

## Tests attendus

- Vitest : `DownloadStore` et le choix d'implémentation selon le navigateur.
- Playwright (Chromium) : nouveau document, enregistrement et ouverture avec une fausse implémentation de `FileStore`,
  ouverture d'un second fichier sans mélange, fichiers invalides, titre de la fenêtre,
  Ctrl/Cmd+S après « Ouvrir » (réécriture du fichier ouvert) et après « Nouveau » (demande d'emplacement),
  Ctrl/Cmd+S sans fenêtre du navigateur, Ctrl/Cmd+Z sans effet sur le document précédent.

## Hors périmètre

Copie de secours, sauvegarde automatique, PWA.

## Vérification manuelle

Sur un Mac avec Chrome, puis sur un PC Windows avec Edge :

1. Enregistrer dans un dossier, modifier, appuyer sur Ctrl/Cmd+S, fermer, rouvrir le fichier.
2. Ouvrir un fichier existant, le modifier, appuyer sur Ctrl/Cmd+S et vérifier que le fichier sur le disque a changé.
3. Ouvrir un second fichier et vérifier que le contenu du premier n'apparaît pas.
4. Ouvrir sur le PC un fichier créé sur le Mac.
