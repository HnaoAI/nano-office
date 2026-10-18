# src/ui

Composants React, sans logique métier. Aucun accès direct au disque : passer par `storage/`.

- `App.tsx` : composant racine (boutons de fichier, messages, éditeur recréé pour chaque Y.Doc)
- `useDocumentFile.ts` : hook du document affiché : Nouveau, Ouvrir, Enregistrer, Ctrl/Cmd+S, titre de la fenêtre (T0c)
- `FileMenu.tsx` : boutons Nouveau, Ouvrir…, Enregistrer, Enregistrer sous…
- `shortcuts.ts` : libellé de la touche de commande (Cmd ou Ctrl)
- `DocumentEditor.tsx` : éditeur d'un document, relié à un Y.Doc
- `Toolbar.tsx` : barre d'outils (Gras, Italique, Annuler, Rétablir)
- `styles.css` : mise en page minimale
