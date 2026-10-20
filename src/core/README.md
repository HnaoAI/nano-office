# src/core

Logique pure, sans React ni accès au navigateur. N'importe que des bibliothèques.

- `types.ts` : types partagés (`DocumentJson`, `NanoFileV1`, `ParseResult`) et constantes du format
- `schema.ts` : schéma du document, source unique réutilisée par l'éditeur (`documentExtensions`, `documentSchema`, `YJS_FRAGMENT_NAME`, `BlockId`) ; titres 1 à 3 (T1.1), listes (T1.2), alignement (T1.3), police et taille (T1.4), couleur et surlignage (T1.7)
- `textStyle.ts` : polices intégrées et tailles proposées, attributs `fontFamily` et `fontSize` avec police de secours (T1.4), attribut `color` (T1.7)
- `documentColors.ts` : palettes fixes de la couleur du texte et du surlignage (`TEXT_COLORS`, `HIGHLIGHT_COLORS`, T1.7)
- `fileFormat.ts` : format `.nano` version 1 (`createDocumentId`, `serializeDocument`, `parseDocument`)
- `documentFile.ts` : nouveau document, ouverture avec message d'erreur en français, modifications non enregistrées, titre de la fenêtre (T0c), nom du document dans l'en-tête (U1a)
- `backup.ts` : copie de secours relue dans un Y.Doc neuf, comparaison avec un fichier ouvert, document récupéré ou restauré (T0d)
- `autoSave.ts` : déclenchement de la sauvegarde automatique : 3 secondes après la dernière modification, 30 secondes au plus, jamais deux écritures à la fois, pause après un échec (`AutoSaver`, T1.6)
- `appUpdate.ts` : décision « recharger maintenant ou attendre » quand une nouvelle version est prête (`decideUpdate`, H1)
- `appVersion.ts` : numéro de version `v<date>·<commit court>`, ou `dev` (`formatVersion`, H1)
- `base64.ts` : conversion octets <-> base64 pour l'état Yjs
