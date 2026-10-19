# src/ui

Composants React, sans logique métier. Aucun accès direct au disque : passer par `storage/`.

- `App.tsx` : composant racine (en-tête, messages, question de la copie de secours, éditeur recréé pour chaque Y.Doc, pied de page)
- `AppHeader.tsx` : en-tête : logo, nom et version de l'application (H1), nom du document et du fichier, groupe Fichier (U1a)
- `useDocumentFile.ts` : hook du document affiché : Nouveau, Ouvrir, Enregistrer, Ctrl/Cmd+S, titre de la fenêtre (T0c), restauration et question de la copie de secours (T0d), signes de travail commencé (H1)
- `useBackup.ts` : relie le document affiché à sa copie de secours, retient le dernier document modifié, alerte avant fermeture (T0d), indique si la copie est à jour (U1a)
- `useAppUpdate.ts` : enregistre le service worker et applique une nouvelle version au démarrage si rien n'est commencé (H1)
- `appVersion.ts` : version injectée par Vite à la construction (H1)
- `BackupChoice.tsx` : question « Récupérer » ou « Ouvrir tel quel » quand un fichier diffère de sa copie de secours (T0d)
- `FileMenu.tsx` : groupe Fichier : Nouveau, Ouvrir…, Enregistrer sous…, Enregistrer (bouton principal)
- `shortcuts.ts` : libellés des raccourcis (Cmd ou Ctrl, ⌘S ou Ctrl+S)
- `icons.tsx` : icônes SVG au trait (Annuler, Rétablir) (U1a)
- `fonts.ts` : polices IBM Plex Sans et Mono intégrées (U1a)
- `DocumentEditor.tsx` : barre de mise en forme et éditeur d'un document, relié à un Y.Doc, sur une page centrée
- `Toolbar.tsx` : barre de mise en forme flottante (Annuler, Rétablir, Gras, Italique)
- `styles.css` : styles de la charte ; couleurs, rayons et ombres en variables `--nano-…` dans `:root`
