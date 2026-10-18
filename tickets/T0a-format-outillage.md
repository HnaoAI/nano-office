# T0a : Outillage et format de fichier `.nano`

**Statut** : à valider par le product owner
**Dépend de** : aucun
**Taille estimée** : M
**Branche** : `ticket/T0a-format-outillage`

## Besoin utilisateur

En tant que membre de la famille, je veux que mes documents soient enregistrés dans un format
fiable, que l'on pourra toujours relire, afin de ne jamais perdre ce que j'ai écrit.

Ce ticket pose les fondations, sans interface : le projet, l'outillage et la logique pure du format.

## Périmètre

- Projet Vite + React + TypeScript strict
- Outillage : ESLint, Prettier, Vitest, Playwright (installé, sans test d'interface pour l'instant)
- Scripts npm attendus par la CI : `dev`, `build`, `typecheck`, `lint`, `test`, `test:e2e`
- Format de fichier `.nano` version 1 dans `src/core/`, sans accès au navigateur

## Interfaces attendues

Dans `src/core/fileFormat.ts` :

- `createDocumentId(): string` (UUID)
- `serializeDocument(doc: { id: string; ydoc: Y.Doc; content: JSONContent }): string`
- `parseDocument(text: string): ParseResult`
  - succès : `{ ok: true, id: string, ydoc: Y.Doc, version: number }`
  - échec : `{ ok: false, error: "invalid-json" | "not-nano" | "unsupported-version" | "corrupted" }`

`parseDocument` crée toujours un nouveau `Y.Doc`. Il n'applique jamais un état sur un `Y.Doc` existant.

## Critères d'acceptation

1. `npm run typecheck`, `npm run lint` et `npm test` passent, et la CI GitHub les exécute.
2. Un document sérialisé contient `format`, `version` (1), `id`, `content` et `ydoc`.
3. Sérialiser puis relire redonne le même `id` et le même contenu : texte, gras, italique, paragraphes, accents et emojis.
4. Les identifiants de paragraphes sont conservés après l'aller-retour.
5. Si `ydoc` est illisible, le document est reconstruit à partir de `content`.
6. Un JSON invalide, un fichier qui n'est pas un `.nano` ou une version inconnue renvoie l'erreur correspondante, sans exception.
7. Un fichier sans `id` ou avec un `id` vide est refusé avec l'erreur `not-nano`.
8. Deux appels à `createDocumentId` ne renvoient jamais la même valeur.

## Tests attendus

- Vitest : aller-retour, version inconnue, JSON invalide, fichier étranger, `ydoc` corrompu avec repli sur `content`,
  `id` absent, document vide, texte très long, accents, emojis, identifiants de paragraphes.

## Hors périmètre

Éditeur, interface, accès aux fichiers, copie de secours, PWA.

## Vérification manuelle

Aucune : ce ticket n'a pas d'interface. Vérifier que la CI de la PR est verte.
