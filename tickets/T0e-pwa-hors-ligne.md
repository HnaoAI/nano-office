# T0e : Application installable et hors ligne

**Statut** : à valider par le product owner
**Dépend de** : T0b
**Taille estimée** : S
**Branche** : `ticket/T0e-pwa-hors-ligne`

## Besoin utilisateur

En tant que membre de la famille, je veux installer Nano Office comme une application
et m'en servir sans connexion internet.

## Critères d'acceptation

1. `npm run build` produit une version installable (manifeste et service worker, via vite-plugin-pwa).
2. Après un premier chargement, l'application s'ouvre et fonctionne sans connexion internet.
3. Aucune donnée de document n'est envoyée sur le réseau pendant l'édition, l'ouverture ou l'enregistrement. Seuls les fichiers de l'application elle-même peuvent être téléchargés, par exemple pour une mise à jour.

## Tests attendus

- Playwright (Chromium) : fonctionnement hors ligne après un premier chargement, et aucune requête portant
  du contenu de document pendant l'édition, l'ouverture et l'enregistrement.

## Hors périmètre

Hébergement de l'application, icônes définitives, message de mise à jour disponible.

## Vérification manuelle

Sur un Mac avec Chrome, puis sur un PC Windows avec Edge :

1. Installer l'application depuis le navigateur.
2. Couper le wifi, relancer l'application, vérifier qu'elle s'ouvre et qu'on peut écrire.
