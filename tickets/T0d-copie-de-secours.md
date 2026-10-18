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

## Tests attendus

- Playwright (Chromium) : récupération après rechargement, ouverture d'un fichier puis d'un autre sans mélange
  de copies, alerte avant fermeture.

## Hors périmètre

Mémoriser le fichier ouvert pour le réécrire après récupération (traité avec la sauvegarde automatique, T1.6),
nettoyage des anciennes copies de secours.

## Vérification manuelle

Sur un Mac avec Chrome : écrire sans enregistrer, recharger la page, vérifier la récupération.
Puis ouvrir un fichier existant et vérifier que le texte récupéré ne s'y mélange pas.
