# PL3 : Se souvenir du fichier au redémarrage

**Suivi** : Issue [#38](https://github.com/HnaoAI/nano-office/issues/38), le statut se lit sur le tableau Kanban
**Dépend de** : T1.6
**Taille estimée** : M
**Branche** : `ticket/PL3-se-souvenir-du-fichier`
**Lot** : B. Ne jamais perdre, après T1.6

## User story

En tant que membre de la famille, je veux qu'après avoir fermé puis rouvert Nano Buro, mon document
s'enregistre toujours dans le même fichier, afin de ne pas avoir à refaire « Enregistrer sous ».

## Contexte

Aujourd'hui, au redémarrage, l'application ne se souvient plus du fichier : elle restaure la copie de
secours et propose « Enregistrer sous… ». Sorti de T1.6 le 2026-10-19 pour garder T1.6 simple.

## Critères d'acceptation

1. Sur Chrome et Edge, le fichier du document est retenu entre deux lancements (poignée de fichier
   gardée dans le stockage du navigateur, rangée sous l'`id` du document).
2. Au lancement, si le navigateur demande à nouveau l'autorisation d'écrire, un message propose de la
   redonner en un clic. Tant qu'elle n'est pas redonnée, rien n'est écrit dans le fichier, et la copie
   de secours protège les modifications.
3. Si le fichier a été déplacé ou supprimé, le message d'échec existant propose « Enregistrer sous… ».
4. Le fichier sur le disque n'est jamais réécrit sans que l'utilisateur ait vu son nom.

## Hors périmètre

Liste des fichiers récents, Safari et Firefox (qui n'ont pas cette API).
