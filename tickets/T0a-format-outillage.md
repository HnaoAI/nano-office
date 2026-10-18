# T0a : Outillage et format de fichier `.nano`

**Suivi** : Issue [#2](https://github.com/HnaoAI/nano-office/issues/2), le statut se lit sur le tableau Kanban
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
- `test:e2e` vaut `playwright test --pass-with-no-tests` : sans cette option, Playwright échoue quand il ne trouve
  aucun test, et la CI serait rouge. Option vérifiée avec `@playwright/test` 1.64.1. T0b la retire en ajoutant les premiers tests.
- Schéma du document partagé dans `src/core/schema.ts`, réutilisé tel quel par l'éditeur (T0b)
- Format de fichier `.nano` version 1 dans `src/core/`, sans accès au navigateur

## Interfaces attendues

Dans `src/core/schema.ts`, source unique du schéma, que T0b réutilise sans le redéfinir :

- `documentExtensions` : la liste des extensions Tiptap du document (paragraphes, gras, italique, identifiant de bloc)
- l'extension d'identifiant de bloc, qui ajoute l'attribut d'identifiant aux paragraphes
- `documentSchema` : le schéma ProseMirror obtenu à partir de `documentExtensions` (`getSchema`)
- `YJS_FRAGMENT_NAME` : le nom du fragment Yjs qui contient le document, utilisé aussi par l'extension de collaboration de T0b

Dans `src/core/fileFormat.ts` :

- `createDocumentId(): string` (UUID)
- `serializeDocument(doc: { id: string; ydoc: Y.Doc }): string`
  - calcule lui-même `content` à partir du fragment `YJS_FRAGMENT_NAME` du `ydoc`, pour que `content` et `ydoc` ne puissent pas diverger
- `parseDocument(text: string): ParseResult`
  - succès : `{ ok: true, id: string, ydoc: Y.Doc, version: number }`
  - échec : `{ ok: false, error: "invalid-json" | "not-nano" | "unsupported-version" | "corrupted" }`

`parseDocument` crée toujours un nouveau `Y.Doc`. Il n'applique jamais un état sur un `Y.Doc` existant.
Le repli sur `content` reconstruit le `Y.Doc` avec `documentSchema` et `YJS_FRAGMENT_NAME`.

Un `ydoc` abîmé ne lève pas toujours d'exception : Yjs peut l'appliquer et produire un document vide ou partiel.
Après avoir relu le `ydoc`, `parseDocument` recalcule donc son contenu et le compare au `content` enregistré.
Comme `content` est calculé à partir du `ydoc` au moment de l'enregistrement, les deux doivent être identiques.
S'ils diffèrent, le `ydoc` est considéré comme abîmé et le document est reconstruit à partir de `content`.

Piste technique : y-prosemirror fournit les conversions entre un fragment Yjs et le JSON ProseMirror,
sans éditeur ni navigateur. Les tests Vitest tournent sans DOM : si une extension en exige un, le signaler.

## Critères d'acceptation

1. `npm run typecheck`, `npm run lint`, `npm test` et `npm run test:e2e` passent, et la CI GitHub les exécute.
2. Un document sérialisé contient `format`, `version` (1), `id`, `content` et `ydoc`.
3. Sérialiser puis relire redonne le même `id` et le même contenu : texte, gras, italique, paragraphes, accents et emojis.
4. Les identifiants de paragraphes sont conservés après l'aller-retour.
5. Le `content` enregistré correspond toujours au `ydoc` enregistré : il est calculé à partir de lui, jamais fourni par l'appelant.
6. Un document construit avec `documentSchema` (gras, italique, identifiants) est relu sans éditeur.
7. Si `ydoc` est illisible, le document est reconstruit à partir de `content`.
8. Si `ydoc` est lisible mais ne correspond pas à `content` (vide ou partiel), le document est reconstruit à partir de `content`.
9. Un JSON invalide, un fichier qui n'est pas un `.nano` ou une version inconnue renvoie l'erreur correspondante, sans exception.
10. Un fichier sans `id` ou avec un `id` vide est refusé avec l'erreur `not-nano`.
11. Deux appels à `createDocumentId` ne renvoient jamais la même valeur.

## Tests attendus

- Vitest : schéma partagé (gras, italique, identifiants), `content` calculé à partir du `ydoc`, aller-retour, version inconnue, JSON invalide, fichier étranger, `ydoc` illisible avec repli sur `content`, `ydoc` lisible mais vide ou partiel avec repli sur `content`,
  `id` absent, document vide, texte très long, accents, emojis, identifiants de paragraphes.

## Hors périmètre

Éditeur, interface, accès aux fichiers, copie de secours, PWA.

## Vérification manuelle

Aucune : ce ticket n'a pas d'interface. Vérifier que la CI de la PR est verte.
