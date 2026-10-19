# src/storage

Accès aux fichiers de l'utilisateur, derrière l'interface `FileStore`. Aucun composant n'accède au disque autrement.

- `fileStore.ts` : interface `FileStore`, type `SaveResult`, choix de l'implémentation selon le navigateur (`selectFileStore`, `createFileStore`)
- `fileSystemAccessStore.ts` : Chrome et Edge, API File System Access (`createWritable()` puis `close()`)
- `downloadStore.ts` : repli pour Safari et Firefox, enregistrement par téléchargement
- `launchMarker.ts` : souvenir, dans sessionStorage, d'un rechargement pour mise à jour pendant ce lancement (H1)
- `backupStore.ts` : copie de secours dans IndexedDB, une base par `id` de document via y-indexeddb, dernier document modifié (T0d)
