# src/core

Logique pure, sans React ni accès au navigateur. N'importe que des bibliothèques.

- `types.ts` : types partagés (`DocumentJson`, `NanoFileV1`, `ParseResult`) et constantes du format
- `schema.ts` : schéma du document, source unique réutilisée par l'éditeur (`documentExtensions`, `documentSchema`, `YJS_FRAGMENT_NAME`, `BlockId`)
- `fileFormat.ts` : format `.nano` version 1 (`createDocumentId`, `serializeDocument`, `parseDocument`)
- `documentFile.ts` : nouveau document, ouverture avec message d'erreur en français, modifications non enregistrées, titre de la fenêtre (T0c)
- `backup.ts` : copie de secours relue dans un Y.Doc neuf, comparaison avec un fichier ouvert, document récupéré ou restauré (T0d)
- `base64.ts` : conversion octets <-> base64 pour l'état Yjs
