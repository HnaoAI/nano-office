# src/editor

Configuration de Tiptap et de ses extensions. Sans React ; le schéma vient de `core/schema.ts`.

- `editorOptions.ts` : options de l'éditeur pour un Y.Doc (`createEditorOptions`) : schéma partagé, collaboration Yjs, aucune mise en forme automatique, correcteur orthographique, raccourcis et copier-coller du lot A
- `blockIds.ts` : génère l'identifiant de chaque paragraphe nouveau ou en double (`BlockIdGenerator`, `createBlockIdPlugin`)
- `platform.ts` : reconnaît un Mac, pour choisir les raccourcis (`isMacPlatform`, T1.1)
- `blockStyle.ts` : texte normal ou titre 1 à 3, en gardant les attributs du bloc (`setBlockStyle`, `currentBlockStyle`, T1.1)
- `lists.ts` : listes à puces et numérotées : type de la liste du curseur, Tab et Shift+Tab sur trois niveaux (T1.2)
- `alignment.ts` : alignement à gauche, centré, à droite ou justifié des paragraphes et titres (`setAlignment`, `currentAlignment`, T1.3)
- `fontStyle.ts` : police et taille de la sélection ou du texte tapé ensuite, lecture au curseur (`setFontFamily`, `setFontSize`, `currentTextStyle`, T1.4)
- `textColor.ts` : couleur du texte et surlignage de la sélection ou du texte tapé ensuite, lecture au curseur (`setTextColor`, `setHighlight`, `currentTextColor`, `currentHighlight`, T1.7)
- `tables.ts` : insertion d'un tableau, curseur dans un tableau, ligne d'en-tête, lignes et colonnes supprimables, curseur entre deux blocs et paragraphe après un tableau final (`insertTable`, `tableDeletions`, `TableNavigation`, T1.8)
- `tablePaste.ts` : cellules fusionnées séparées et tableaux imbriqués aplatis dans le HTML collé, tableau collé dans une cellule mis à plat, bordures du tableau copié vers un e-mail (T1.8)
- `clipboard.ts` : copier-coller propre : structure gardée, mise en forme d'origine retirée (couleurs et surlignages compris, T1.7), listes de Word converties, tableaux gardés (T1.8), nouveaux identifiants (`CleanClipboard`, T1.5)
- `focus.ts` : redonne le focus à l'éditeur tout de suite après un clic sur la barre (`focusEditor`, lot A)
- `keyboardShortcuts.ts` : raccourcis de mise en forme reconnus à la touche physique, jamais avec AltGr (`FormatShortcuts`, T1.1)
- `userEdits.ts` : reconnaît une modification faite par l'utilisateur, pour la mise à jour au démarrage (`isUserEdit`, H1)
- `devTestHook.ts` : expose le contenu du Y.Doc aux tests Playwright, en développement seulement
