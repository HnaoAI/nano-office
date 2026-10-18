# src/storage

Accès aux fichiers de l'utilisateur, derrière l'interface `FileStore`. Aucun composant n'accède au disque autrement.

- `fileStore.ts` : interface `FileStore`, type `SaveResult`, choix de l'implémentation selon le navigateur (`selectFileStore`, `createFileStore`)
- `fileSystemAccessStore.ts` : Chrome et Edge, API File System Access (`createWritable()` puis `close()`)
- `downloadStore.ts` : repli pour Safari et Firefox, enregistrement par téléchargement
