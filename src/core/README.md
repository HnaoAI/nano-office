# src/core

Logique pure, sans React ni accès au navigateur. N'importe que des bibliothèques.

- `types.ts` : types partagés (`DocumentJson`, `NanoFileV1`, `NanoFileV2`, `ParseResult`) et constantes du format
- `schema.ts` : schéma du document, source unique réutilisée par l'éditeur (`documentExtensions`, `documentSchema`, `YJS_FRAGMENT_NAME`, `BlockId`) ; titres 1 à 3 (T1.1), listes (T1.2), alignement (T1.3), police et taille (T1.4), couleur et surlignage (T1.7), tableaux (T1.8), images (T1.9), interligne (T2.2), barré (T2.3), sauts de page (T2.8)
- `textStyle.ts` : polices intégrées et tailles proposées, attributs `fontFamily` et `fontSize` avec police de secours (T1.4), attribut `color` (T1.7)
- `lineHeight.ts` : interligne (T2.2) : valeurs proposées, hauteur de ligne CSS équivalente à Word (`cssLineHeight`), attribut de bloc `lineHeight`
- `search.ts` : recherche d'un texte dans un paragraphe, majuscules ignorées ou non, textes « 3 sur 12 » et « 12 remplacements » (`findInText`, `searchStatus`, T2.1)
- `textCase.ts` : majuscules et minuscules selon les règles du français, phrase et mot pris dans leur paragraphe (`convertCase`, `CASE_MODES`, T2.4)
- `tableSchema.ts` : tableaux : document qui accepte les tableaux, tableau sans tableau imbriqué, taille de la grille d'insertion (T1.8)
- `pageSetup.ts` : mise en page (T2.5) : orientation et marges d'une page A4, `Y.Map` « page » du Y.Doc, attributs du nœud `doc` de `content`, marges écrites et lues à la française (`readPageSetup`, `writePageSetup`, `withPageSetupAttrs`), règle `@page` de l'impression (`printPageRule`, T2.6)
- `pageBreaks.ts` : coupures de page (T2.8) : calcul pur à partir des hauteurs mesurées, avec les règles de l'impression (deux lignes de chaque côté d'une coupure, titre jamais seul en bas de page, ligne de tableau et image entières, saut de page manuel), page d'une hauteur donnée, texte « Page 3 sur 7 » (`computePageBreaks`, `pageAt`, `pageCounterText`, `textAreaHeight`)
- `pageBreakSchema.ts` : nœud « saut de page » du schéma, dans son propre groupe : jamais dans une liste ni un tableau ; rendu `break-before: page`, lu depuis `page-break-before: always` (`PageBreakNode`, T2.8)
- `wordExport.ts` : export en fichier Word `.docx` avec `docx` (T2.7) : styles des titres de Word, listes, page A4 avec orientation et marges, polices embarquées, nom proposé (`buildWordDocument`, `exportWord`, `wordFileName`, `usedFonts`)
- `wordBlocks.ts` : conversion des blocs pour Word (T2.7) : paragraphes, titres, listes, tableaux, images (`convertBlock`)
- `wordColors.ts` : couleur du texte pour Word et surlignage ramené aux couleurs de Word (`wordColor`, `nearestHighlight`, T2.7)
- `woff.ts` : police WOFF convertie en TrueType, pour l'embarquer dans un fichier Word (`woffToSfnt`, T2.7)
- `imageSize.ts` : largeur et hauteur d'une image PNG, GIF, JPEG ou WebP, lues dans son en-tête (`imageSize`, T2.7)
- `documentColors.ts` : palettes fixes de la couleur du texte et du surlignage (`TEXT_COLORS`, `HIGHLIGHT_COLORS`, T1.7)
- `fileFormat.ts` : format `.nano` version 2 (`createDocumentId`, `serializeDocument`, `parseDocument`) : images rangées une fois dans `images`, triées par empreinte, en fin de fichier, `ydoc` enregistré sans elles (T1.9) ; mise en page en attributs du nœud `doc` de `content` (T2.5)
- `migrations.ts` : migrations du format, de la version 1 à la version 2 (`migrateV1ToV2`, `migrateToCurrent`, T1.9)
- `images.ts` : images (T1.9) : format reconnu aux premiers octets, empreinte SHA-256, règles de réduction, `Y.Map` « images » du Y.Doc, texte de remplacement par défaut
- `imageSchema.ts` : nœud image du schéma, dans son propre groupe : jamais dans une liste ni un tableau (`ImageNode`, T1.9)
- `documentFile.ts` : nouveau document, ouverture avec message d'erreur en français, modifications non enregistrées (une image seule compte, T1.9), titre de la fenêtre (T0c), nom du document dans l'en-tête (U1a)
- `backup.ts` : copie de secours relue dans un Y.Doc neuf, comparaison avec un fichier ouvert, document récupéré ou restauré (T0d), images comprises (T1.9)
- `autoSave.ts` : déclenchement de la sauvegarde automatique : 3 secondes après la dernière modification, 30 secondes au plus (10 et 60 secondes au-delà de 2 Mo, T1.9), jamais deux écritures à la fois, pause après un échec (`AutoSaver`, T1.6)
- `appUpdate.ts` : décision « recharger maintenant ou attendre » quand une nouvelle version est prête (`decideUpdate`, H1), fenêtre « se met à jour » et son délai de 20 s (`showsUpdateWindow`, `startUpdateWatchdog`, H3)
- `appVersion.ts` : numéro de version `v<date>·<commit court>`, ou `dev` (`formatVersion`, H1)
- `base64.ts` : conversion octets <-> base64 pour l'état Yjs
- `assistant.ts` : assistant facultatif (T3.1) : réglages (éteint par défaut), modèles proposés, consignes et demande envoyée (la sélection seule), lecture de la réponse, corrections au mot ou au paragraphe entier, messages d'erreur (`buildRequest`, `parseParagraphs`, `correctionChanges`, `failureMessage`)
- `wordDiff.ts` : comparaison au mot de deux textes et compte des mots, limite de 5 000 mots (`diffWords`, `countWords`, `MAX_ASSISTANT_WORDS`, T3.1)
