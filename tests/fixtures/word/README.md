# tests/fixtures/word

Fichiers Word d'exemple du ticket T2.18 (ouvrir un `.docx`). Aucun document de la famille.

- `complet.docx` : tout ce que reprend le critère 2 (titres, mise en forme, polices, listes, tableau fusionné, image, lien, saut de page, page Lettre US en paysage, en-tête, numéro de page), fait par python-docx à partir du modèle de Word
- `libreoffice.docx` : le même, enregistré par LibreOffice
- `elements-non-repris.docx` : commentaire, suivi des modifications, note de bas de page, champ de date, zone de texte (critère 3)
- `export-nano-buro.docx` : fichier exporté par Nano Buro (T2.7), pour l'aller-retour ; refait par `UPDATE_WORD_FIXTURES=1 npx vitest run tests/core/wordImportRoundTrip.test.ts`
- `ancien.doc`, `document.odt` : formats refusés (critère 4), faits par LibreOffice
- `protege.docx` : imitation d'un fichier protégé par un mot de passe (signature OLE et flux `EncryptedPackage`), seul moyen sans outil de chiffrement
- `make_fixtures.py` : refait les fichiers ci-dessus, sauf l'export de Nano Buro (`python3 tests/fixtures/word/make_fixtures.py`)
