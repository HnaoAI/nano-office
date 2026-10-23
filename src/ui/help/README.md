# src/ui/help

Aide intégrée à Nano Buro (A1), affichée hors ligne dans un panneau à droite de la page.

- `helpContent.ts` : texte de l'aide en données structurées (sections, étapes, messages cités), à relire dans la PR
- `helpMessages.ts` : phrases des messages cités, reprises des constantes de l'application
- `helpShortcuts.ts` : tableau des raccourcis, tiré de la liste réelle (`editor/keyboardShortcuts.ts`), touches de l'ordinateur utilisé (⌘ ou Ctrl)
- `helpIcons.tsx` : icônes au trait de l'aide et du bouton « Aide »
- `HelpPanel.tsx` : panneau : titre, sommaire cliquable, sections, version et adresse en bas ; Échap le ferme
- `useHelpPanel.ts` : ouverture et fermeture, raccourci Ctrl/Cmd+/, retour du focus
