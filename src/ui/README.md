# src/ui

Composants React, sans logique métier. Aucun accès direct au disque : passer par `storage/`.

- `App.tsx` : composant racine (en-tête, message, question de la copie de secours, éditeur recréé pour chaque Y.Doc, pied de page)
- `AppHeader.tsx` : en-tête : logo, nom et version de l'application (H1), nom du document et du fichier, indicateur d'enregistrement (U1b), groupe Fichier (U1a)
- `useDocumentFile.ts` : hook du document affiché : Nouveau, Ouvrir, Enregistrer, Ctrl/Cmd+S, titre de la fenêtre (T0c), restauration et question de la copie de secours (T0d), signes de travail commencé (H1), état de l'indicateur et fermeture des messages (U1b), sauvegarde automatique (T1.6), fichier retrouvé au lancement (PL3), message d'une image refusée (T1.9)
- `useAutoSave.ts` : relie la sauvegarde automatique au Y.Doc affiché, un `AutoSaver` par document (T1.6)
- `useSaveShortcut.ts` : Ctrl/Cmd+S sur toute la page, avant l'éditeur (T0c)
- `fileMessages.ts` : textes et actions des messages (U1b), message d'un document qui a retrouvé son fichier (PL3), image refusée (T1.9)
- `useBackup.ts` : relie le document affiché à sa copie de secours, retient le dernier document modifié, alerte avant fermeture (T0d), indique si la copie est à jour (U1a)
- `useAppUpdate.ts` : enregistre le service worker et applique une nouvelle version au démarrage si rien n'est commencé (H1), même avec un document restauré, sans alerte avant fermeture (H2)
- `appVersion.ts` : version injectée par Vite à la construction (H1)
- `BackupChoice.tsx` : question « Récupérer » ou « Ouvrir tel quel » quand un fichier diffère de sa copie de secours (T0d), en boîte de dialogue sur la page estompée (U1b)
- `SaveIndicator.tsx` : pastille « Enregistré », « Enregistrement… » ou « Non enregistré » (U1b)
- `MessageBar.tsx` : message d'information ou d'alerte, avec puce d'icône, action éventuelle (« Enregistrer sous… », « Enregistrer », « Autoriser ») et bouton de fermeture (U1b, PL3)
- `FileMenu.tsx` : groupe Fichier : Nouveau, Ouvrir…, Enregistrer sous…, Enregistrer (bouton principal)
- `shortcuts.ts` : libellés des raccourcis (Cmd ou Ctrl, ⌘S ou Ctrl+S, raccourcis des titres)
- `icons.tsx` : icônes SVG au trait (Annuler, Rétablir) (U1a), icônes des messages et de la boîte de dialogue (U1b), listes (T1.2), alignement (T1.3), surlignage (T1.7), images (T1.9)
- `fonts.ts` : polices intégrées : IBM Plex Sans et Mono de l'interface (U1a), cinq polices du document en quatre graisses (T1.4)
- `ParagraphStyleSelect.tsx` : liste déroulante « Style du paragraphe » : texte normal, titre 1 à 3 (T1.1)
- `ListButtons.tsx` : boutons « Liste à puces » et « Liste numérotée » (T1.2)
- `AlignmentButtons.tsx` : boutons d'alignement : gauche, centré, droite, justifié (T1.3)
- `FontSelects.tsx` : listes déroulantes « Police » et « Taille » (T1.4)
- `ColorButtons.tsx` : boutons « Couleur du texte » et « Surlignage » et leurs grilles de pastilles (T1.7)
- `usePopover.ts` : petite fenêtre d'un bouton de la barre, fermée par Échap ou un clic à côté, déplacement aux flèches dans une grille (T1.7)
- `TableButtons.tsx` : « Insérer un tableau » et sa grille de 8 × 8 cases, groupe « Tableau » quand le curseur est dans un tableau (T1.8)
- `ImageButtons.tsx` : « Insérer une image » et son sélecteur de fichiers, groupe « Image » et « Texte de remplacement » quand une image est sélectionnée (T1.9)
- `tableIcons.tsx` : icônes au trait des tableaux (T1.8)
- `DocumentEditor.tsx` : barre de mise en forme et éditeur d'un document, relié à un Y.Doc, sur une page centrée
- `Toolbar.tsx` : barre de mise en forme flottante (Annuler, Rétablir, style du paragraphe, police, taille, Gras, Italique, couleur, surlignage, alignement, listes, tableau, image)
- `styles/` : feuilles de style de la charte, découpées par zone (voir `styles/README.md`) ; couleurs, rayons et ombres en variables `--nano-…` dans `styles/tokens.css`
