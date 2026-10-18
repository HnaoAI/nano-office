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
- deux implémentations : `FileSystemAccessStore` (Chrome, Edge) et `DownloadStore` (repli)

Les tests d'interface remplacent `FileStore` par une fausse implémentation.

## Critères d'acceptation

1. « Nouveau » ouvre un document vide avec un nouvel `id`. S'il y a des modifications non enregistrées, une confirmation est demandée.
2. « Enregistrer sous » propose le nom `document.nano` et laisse choisir l'emplacement.
3. Sur Chrome et Edge, après un premier enregistrement, « Enregistrer » et Ctrl/Cmd+S réécrivent le même fichier sans rien demander.
4. L'écriture passe par `createWritable()` puis `close()`, pour que le fichier soit remplacé d'un coup.
5. Sur Safari et Firefox, « Enregistrer » télécharge le fichier et affiche un message recommandant Chrome ou Edge.
6. « Ouvrir » charge un fichier `.nano` dans tous les navigateurs, dans un nouveau `Y.Doc`, sans mélange avec le document précédent.
7. Enregistrer puis rouvrir redonne exactement le même contenu : texte, gras, italique, paragraphes, accents et emojis.
8. Un fichier d'une version inconnue, un JSON invalide ou un fichier qui n'est pas un `.nano` affiche un message clair en français, sans plantage, et le document en cours reste intact.
9. Le titre de la fenêtre indique le nom du fichier, avec un repère (par exemple `•`) s'il y a des modifications non enregistrées.

## Tests attendus

- Vitest : `DownloadStore` et le choix d'implémentation selon le navigateur.
- Playwright (Chromium) : nouveau document, enregistrement et ouverture avec une fausse implémentation de `FileStore`,
  ouverture d'un second fichier sans mélange, fichiers invalides, titre de la fenêtre.

## Hors périmètre

Copie de secours, sauvegarde automatique, PWA.

## Vérification manuelle

Sur un Mac avec Chrome, puis sur un PC Windows avec Edge :

1. Enregistrer dans un dossier, modifier, appuyer sur Ctrl/Cmd+S, fermer, rouvrir le fichier.
2. Ouvrir un second fichier et vérifier que le contenu du premier n'apparaît pas.
3. Ouvrir sur le PC un fichier créé sur le Mac.
