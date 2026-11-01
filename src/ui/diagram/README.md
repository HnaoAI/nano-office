# src/ui/diagram

Éditeur de formes des schémas (T2.20), avec React Flow (`@xyflow/react`, MIT). Seul `mountDiagramEditor.ts`
est chargé au démarrage ; le reste l'est au premier schéma ouvert (critère 11), ou au premier export Word.

- `mountDiagramEditor.ts` : monte l'éditeur de formes dans un bloc Schéma, chargé à la demande (`mountDiagramEditor`)
- `renderDiagramEditor.tsx` : point d'entrée chargé à la demande, racine React de l'éditeur (`renderDiagramEditor`)
- `DiagramEditor.tsx` : éditeur React Flow : formes, flèches, grille magnétique, sélection multiple, copier-coller, Ctrl/Cmd+Z, poignée du bas, chaque action enregistrée dans le document
- `ShapeNode.tsx` : forme (même dessin que hors modification), points d'accroche, poignées de taille, saisie du texte (`ShapeNode`, `TextField`)
- `ArrowEdge.tsx` : flèche droite entre deux points d'accroche, avec son texte (`ArrowEdge`, `ArrowMarker`)
- `DiagramToolbar.tsx` : petite barre : quatre formes, fond des formes, Supprimer, Terminer
- `diagramContext.ts` : formes affichées, mesure des textes et texte en cours de saisie, partagés par les formes et les flèches
- `diagramIcons.tsx` : icônes des formes et de Supprimer
- `diagramImage.ts` : image PNG d'un schéma pour l'export Word, police embarquée (`diagramPng`, `loadDiagramImages`)
