# src/ui/styles

Feuilles de style de la charte `docs/design/README.md`, importées dans cet ordre par `App.tsx`.
Couleurs, rayons et ombres ne sont écrits que dans `tokens.css` (vérifié par `tests/ui/styles.test.ts`).

- `tokens.css` : variables `--nano-…` (U1a)
- `layout.css` : bases, partie figée en haut de la fenêtre (M1), en-tête, groupe Fichier, page du document, pied de page (U1a) ; page A4 et marges du document en centimètres (T2.5)
- `toolbar.css` : barre de mise en forme flottante (U1a), liste avec une icône (interligne, M1)
- `pickers.css` : petites fenêtres de la barre, grilles de couleurs et trait sous le « A » (T1.7), menu « Majuscules et minuscules » (T2.4)
- `tables.css` : tableaux du document, curseur entre deux blocs, groupe « Tableau » et grille d'insertion (T1.8)
- `images.css` : images du document, sélection et poignées, cadre « Image manquante », fenêtre « Texte de remplacement » (T1.9)
- `search.css` : barre « Rechercher et remplacer » et occurrences surlignées dans le document (T2.1)
- `messages.css` : indicateur d'enregistrement et messages (U1b)
- `print.css` : impression et PDF : seule la page du document, couleurs exactes, titres jamais seuls en bas de page, lignes de tableau entières, ni recherche ni sélection (T2.6)
- `dialog.css` : boîte de dialogue de la copie de secours sur la page estompée (U1b), boîte « Mise en page » (T2.5)
- `assistant.css` : assistant (T3.1) : bouton et boîte « Réglages », groupe « Assistant », panneau au style des messages, marques de suggestion (barré gris, souligné sur gris clair), boutons de la modification choisie, rien à l'impression
- `update.css` : fenêtre « Nano Buro se met à jour » et son N qui tourne, ou qui pulse si le système demande moins d'animations (H3)
