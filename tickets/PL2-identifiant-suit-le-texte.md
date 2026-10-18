# PL2 : L'identifiant d'un paragraphe suit son texte après Entrée

**Suivi** : Issue [#18](https://github.com/HnaoAI/nano-office/issues/18), le statut se lit sur le tableau Kanban
**Dépend de** : T0b
**Taille estimée** : S
**Branche** : `ticket/PL2-identifiant-suit-le-texte`
**Tranche** : plus tard, non planifié

## User story

En tant que membre de la famille, je veux qu'un paragraphe garde son identité quand j'insère une ligne vide
au-dessus avec Entrée, afin que ce qui lui sera attaché plus tard (commentaires, collaboration) reste au bon endroit.

## Contexte

Depuis T0b, chaque paragraphe porte un identifiant stable (règle produit 5). Quand on appuie sur Entrée
au début d'un paragraphe non vide, Tiptap garde l'identifiant sur le paragraphe vide créé au-dessus,
et le texte descend dans un paragraphe au nouvel identifiant. Rien n'utilise encore ces identifiants,
mais l'identifiant doit suivre le contenu (question posée dans la PR #17, décision du product owner du 2026-10-18).

## Critères d'acceptation

1. Entrée au début d'un paragraphe non vide : le paragraphe qui contient le texte garde son identifiant, et le paragraphe vide créé au-dessus en reçoit un nouveau.
2. Entrée au milieu ou à la fin d'un paragraphe : comportement inchangé (la première partie garde l'identifiant, la nouvelle partie en reçoit un nouveau).
3. Aucun doublon d'identifiant, quel que soit l'endroit où l'on appuie sur Entrée.
4. Ctrl/Cmd+Z annule l'Entrée en une seule étape et rend au paragraphe son identifiant d'origine.
5. La règle s'applique à tous les blocs qui portent un identifiant (`BLOCK_TYPES_WITH_ID`).

## Note technique

La logique est dans `src/editor/blockIds.ts` (T0b). Le schéma partagé (`src/core/schema.ts`) n'est pas modifié.

## Hors périmètre

Commentaires, collaboration en ligne. Pour plus tard : en collaboration, deux personnes pourraient corriger
le même doublon chacune de leur côté et produire deux identifiants différents (remarque de la relecture de la PR #17).

## Tests attendus

- Vitest : Entrée au début, au milieu et à la fin d'un paragraphe, avec la propriété des identifiants vérifiée.
- Playwright (Chromium) : Entrée au début d'un paragraphe, identifiants affichés et enregistrés dans le Y.Doc, puis Ctrl/Cmd+Z.

## Vérification manuelle

Aucune vérification visible : les identifiants ne s'affichent pas. Les tests automatiques suffisent.
