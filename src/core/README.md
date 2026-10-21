# src/core

Logique pure, sans React ni accès au navigateur. N'importe que des bibliothèques.

- `types.ts` : types partagés (`DocumentJson`, `NanoFileV1`, `NanoFileV2`, `ParseResult`) et constantes du format
- `schema.ts` : schéma du document, source unique réutilisée par l'éditeur (`documentExtensions`, `documentSchema`, `YJS_FRAGMENT_NAME`, `BlockId`) ; titres 1 à 3 (T1.1), listes (T1.2), alignement (T1.3), police et taille (T1.4), couleur et surlignage (T1.7), tableaux (T1.8), images (T1.9), interligne (T2.2), barré (T2.3)
- `textStyle.ts` : polices intégrées et tailles proposées, attributs `fontFamily` et `fontSize` avec police de secours (T1.4), attribut `color` (T1.7)
- `lineHeight.ts` : interligne (T2.2) : valeurs proposées, hauteur de ligne CSS équivalente à Word (`cssLineHeight`), attribut de bloc `lineHeight`
- `search.ts` : recherche d'un texte dans un paragraphe, majuscules ignorées ou non, textes « 3 sur 12 » et « 12 remplacements » (`findInText`, `searchStatus`, T2.1)
- `textCase.ts` : majuscules et minuscules selon les règles du français, phrase et mot pris dans leur paragraphe (`convertCase`, `CASE_MODES`, T2.4)
- `tableSchema.ts` : tableaux : document qui accepte les tableaux, tableau sans tableau imbriqué, taille de la grille d'insertion (T1.8)
- `pageSetup.ts` : mise en page (T2.5) : orientation et marges d'une page A4, `Y.Map` « page » du Y.Doc, attributs du nœud `doc` de `content`, marges écrites et lues à la française (`readPageSetup`, `writePageSetup`, `withPageSetupAttrs`), règle `@page` de l'impression (`printPageRule`, T2.6)
- `documentColors.ts` : palettes fixes de la couleur du texte et du surlignage (`TEXT_COLORS`, `HIGHLIGHT_COLORS`, T1.7)
- `fileFormat.ts` : format `.nano` version 2 (`createDocumentId`, `serializeDocument`, `parseDocument`) : images rangées une fois dans `images`, triées par empreinte, en fin de fichier, `ydoc` enregistré sans elles (T1.9) ; mise en page en attributs du nœud `doc` de `content` (T2.5)
- `migrations.ts` : migrations du format, de la version 1 à la version 2 (`migrateV1ToV2`, `migrateToCurrent`, T1.9)
- `images.ts` : images (T1.9) : format reconnu aux premiers octets, empreinte SHA-256, règles de réduction, `Y.Map` « images » du Y.Doc, texte de remplacement par défaut
- `imageSchema.ts` : nœud image du schéma, dans son propre groupe : jamais dans une liste ni un tableau (`ImageNode`, T1.9)
- `documentFile.ts` : nouveau document, ouverture avec message d'erreur en français, modifications non enregistrées (une image seule compte, T1.9), titre de la fenêtre (T0c), nom du document dans l'en-tête (U1a)
- `backup.ts` : copie de secours relue dans un Y.Doc neuf, comparaison avec un fichier ouvert, document récupéré ou restauré (T0d), images comprises (T1.9)
- `autoSave.ts` : déclenchement de la sauvegarde automatique : 3 secondes après la dernière modification, 30 secondes au plus (10 et 60 secondes au-delà de 2 Mo, T1.9), jamais deux écritures à la fois, pause après un échec (`AutoSaver`, T1.6)
- `appUpdate.ts` : décision « recharger maintenant ou attendre » quand une nouvelle version est prête (`decideUpdate`, H1)
- `appVersion.ts` : numéro de version `v<date>·<commit court>`, ou `dev` (`formatVersion`, H1)
- `base64.ts` : conversion octets <-> base64 pour l'état Yjs
