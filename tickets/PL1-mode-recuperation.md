# PL1 : Mode récupération d'un fichier abîmé

**Suivi** : Issue [#15](https://github.com/HnaoAI/nano-office/issues/15), le statut se lit sur le tableau Kanban
**Dépend de** : T0c, T0d
**Taille estimée** : M
**Branche** : `ticket/PL1-mode-recuperation`
**Tranche** : plus tard, non planifié

## User story

En tant que membre de la famille, je veux récupérer le texte d'un fichier abîmé que Nano Buro refuse d'ouvrir,
afin de ne pas perdre ce que j'avais écrit, sans risquer d'abîmer davantage le fichier d'origine.

## Contexte

Depuis T0c, un fichier dont le `content` est inutilisable est refusé, même si son état Yjs contient du texte :
rien ne permet de vérifier que cet état est complet, et l'enregistrer écraserait l'original par une version
peut-être partielle (décision du 2026-10-18, voir le journal du CLAUDE.md). Ce ticket donne une issue de secours.

## Critères d'acceptation

1. Le message de fichier abîmé (T0c) propose « Essayer de récupérer le texte ».
2. La récupération ouvre ce qui reste lisible (état Yjs, ou à défaut `content`), dans un nouveau document avec un nouvel `id`.
3. Un bandeau indique que le document a été récupéré et qu'il peut être incomplet.
4. Le fichier d'origine n'est jamais réécrit : « Enregistrer » et Ctrl/Cmd+S demandent toujours un nouvel emplacement, avec un nom proposé du type `document (récupéré).nano`.
5. La copie de secours du document récupéré est rangée sous son nouvel `id`, sans toucher à celle du fichier d'origine.
6. Si rien n'est lisible, le message le dit clairement, et le fichier reste intact.

## Hors périmètre

Réparation automatique du fichier d'origine, fusion de plusieurs versions, outil en ligne de commande.

## Tests attendus

- Vitest : extraction du contenu lisible d'un fichier abîmé (état Yjs avec texte et `content` abîmé, `content` seul, rien de lisible).
- Playwright (Chromium) : message avec le bouton de récupération, bandeau, enregistrement forcé sous un nouveau nom.

## Vérification manuelle

Abîmer le `content` d'un fichier `.nano` dans un éditeur de texte, l'ouvrir, récupérer le texte, l'enregistrer,
puis vérifier que le fichier d'origine n'a pas changé sur le disque.
