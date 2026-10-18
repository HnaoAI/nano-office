# src/ui

Composants React, sans logique métier. Aucun accès direct au disque : passer par `storage/`.

- `App.tsx` : composant racine (boutons de fichier, messages, question de la copie de secours, éditeur recréé pour chaque Y.Doc)
- `useDocumentFile.ts` : hook du document affiché : Nouveau, Ouvrir, Enregistrer, Ctrl/Cmd+S, titre de la fenêtre (T0c), restauration et question de la copie de secours (T0d)
- `useBackup.ts` : relie le document affiché à sa copie de secours, retient le dernier document modifié, alerte avant fermeture (T0d)
- `BackupChoice.tsx` : question « Récupérer » ou « Ouvrir tel quel » quand un fichier diffère de sa copie de secours (T0d)
- `FileMenu.tsx` : boutons Nouveau, Ouvrir…, Enregistrer, Enregistrer sous…
- `shortcuts.ts` : libellé de la touche de commande (Cmd ou Ctrl)
- `DocumentEditor.tsx` : éditeur d'un document, relié à un Y.Doc
- `Toolbar.tsx` : barre d'outils (Gras, Italique, Annuler, Rétablir)
- `styles.css` : mise en page minimale
