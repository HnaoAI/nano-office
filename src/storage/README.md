# src/storage

Accès aux fichiers de l'utilisateur, derrière l'interface `FileStore`. Aucun composant n'accède au disque autrement.

- `fileStore.ts` : interface `FileStore`, type `SaveResult`, choix de l'implémentation selon le navigateur (`selectFileStore`, `createFileStore`) ; `remember` et `restore` du fichier retenu (PL3)
- `fileSystemAccessStore.ts` : Chrome et Edge, API File System Access (`createWritable()` puis `close()`) ; la sauvegarde automatique n'écrase pas un fichier modifié ailleurs (T1.6)
- `fileHandleMemory.ts` : fichier de chaque document retenu entre deux lancements, poignée et date de modification gardées dans IndexedDB sous l'`id` du document, pour signaler au lancement un fichier modifié ailleurs (PL3)
- `downloadStore.ts` : repli pour Safari et Firefox, enregistrement par téléchargement
- `exportStore.ts` : écriture d'un fichier exporté (Word, T2.7) à côté du document : sélecteur de Chrome et Edge, téléchargement sinon ; le fichier courant n'est jamais changé (`exportFile`)
- `launchMarker.ts` : souvenir, dans sessionStorage, d'un rechargement pour mise à jour pendant ce lancement (H1)
- `backupStore.ts` : copie de secours dans IndexedDB, une base par `id` de document via y-indexeddb, dernier document modifié (T0d)
- `assistantSettingsStore.ts` : réglages de l'assistant et clés d'API dans le localStorage de cet ordinateur, les clés à part, « Oublier la clé » (T3.1)
