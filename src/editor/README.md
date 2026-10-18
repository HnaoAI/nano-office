# src/editor

Configuration de Tiptap et de ses extensions. Sans React ; le schéma vient de `core/schema.ts`.

- `editorOptions.ts` : options de l'éditeur pour un Y.Doc (`createEditorOptions`) : schéma partagé, collaboration Yjs, aucune mise en forme automatique, correcteur orthographique
- `blockIds.ts` : génère l'identifiant de chaque paragraphe nouveau ou en double (`BlockIdGenerator`, `createBlockIdPlugin`)
- `devTestHook.ts` : expose le contenu du Y.Doc aux tests Playwright, en développement seulement
