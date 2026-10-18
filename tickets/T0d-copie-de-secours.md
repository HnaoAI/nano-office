# T0d : Copie de secours et récupération

**Statut** : à valider par le product owner
**Dépend de** : T0c
**Taille estimée** : S
**Branche** : `ticket/T0d-copie-de-secours`

## Besoin utilisateur

En tant que membre de la famille, je veux retrouver mon texte si la page se recharge
ou si l'ordinateur s'éteint, même si je n'ai pas enregistré.

## Critères d'acceptation

1. Chaque modification est copiée dans le stockage du navigateur (IndexedDB via y-indexeddb).
2. La copie de secours est rangée sous l'`id` du document : deux documents n'ont jamais la même copie.
3. Ouvrir un fichier ne mélange jamais son contenu avec la copie de secours d'un autre document.
4. Après rechargement de la page ou fermeture brutale, le dernier document modifié est restauré, avec un message indiquant qu'il s'agit d'une récupération.
5. Fermer l'onglet avec des modifications non enregistrées dans le fichier déclenche l'alerte du navigateur.
6. Quand on ouvre un fichier dont l'`id` a déjà une copie de secours, la copie n'est jamais appliquée automatiquement sur le document ouvert.
7. Si cette copie a le même contenu que le fichier, le fichier s'ouvre sans question.
8. Si cette copie diffère du fichier, un message en français demande : « Récupérer les modifications non enregistrées » ou « Ouvrir le fichier tel quel ».
9. « Récupérer » ouvre le contenu de la copie de secours seule, sans le fusionner avec le fichier. Le document est marqué comme non enregistré.
10. « Ouvrir le fichier tel quel » efface la copie de secours de cet `id`, puis ouvre le fichier.
11. Tant que l'utilisateur n'a pas choisi, la copie de secours reste intacte : fermer l'onglet à ce moment ne la perd pas.

## Note technique

Pour comparer, la copie de secours est lue dans un `Y.Doc` temporaire, sans la brancher sur le document ouvert,
puis son contenu est comparé au `content` du fichier avec la même conversion que `serializeDocument` (T0a).
y-indexeddb n'est relié au document qu'après le choix, ou directement si les contenus sont identiques.

## Tests attendus

- Playwright (Chromium) : récupération après rechargement, ouverture d'un fichier puis d'un autre sans mélange
  de copies, alerte avant fermeture.
- Playwright (Chromium) : réouverture d'un fichier avec une copie identique (pas de question), avec une copie
  différente (question, puis chacun des deux choix), et fermeture de l'onglet avant de choisir.

## Hors périmètre

Mémoriser le fichier ouvert pour le réécrire après récupération (traité avec la sauvegarde automatique, T1.6),
nettoyage des anciennes copies de secours.

## Vérification manuelle

Sur un Mac avec Chrome : écrire sans enregistrer, recharger la page, vérifier la récupération.
Puis ouvrir un fichier existant et vérifier que le texte récupéré ne s'y mélange pas.

Ouvrir un fichier, le modifier sans enregistrer, fermer l'onglet, puis rouvrir le même fichier :
vérifier la question, essayer « Récupérer », puis recommencer avec « Ouvrir le fichier tel quel ».
