# H1 : Publication automatique sur GitHub Pages, mise à jour au démarrage et numéro de version

**Suivi** : Issue [#32](https://github.com/HnaoAI/nano-office/issues/32), le statut se lit sur le tableau Kanban
**Dépend de** : R1 (renommage en Nano Buro)
**Taille estimée** : M
**Branche** : `ticket/H1-publication-github-pages`

## User story

En tant que product owner, je veux que chaque fusion sur `main` arrive toute seule dans l'application installée
sur mes ordinateurs, et voir quelle version j'utilise, afin de tester sans Terminal, sur le Mac comme sur le PC.

## Critères d'acceptation

**Publication**

1. Une GitHub Action (`.github/workflows/deploy.yml`) construit l'application et la publie sur GitHub Pages
   à chaque fusion sur `main`, et seulement si la CI passe.
2. L'application publiée s'ouvre à l'adresse `https://hnaoai.github.io/nano-office/`, s'installe depuis Chrome
   et Edge, et fonctionne hors ligne après un premier chargement.
3. Le sous-dossier `/nano-office/` est réglé par une variable de construction (par exemple `BASE_PATH`) :
   `npm run dev`, `npm run build` et les tests Playwright gardent la racine `/`. Le manifeste utilise des chemins
   relatifs (`start_url` et `scope` : `./`).
4. Aucune donnée de document n'est envoyée sur le réseau (règle produit 2) : seuls les fichiers de l'application
   sont téléchargés depuis GitHub Pages.

**Mise à jour au démarrage, sans message**

5. Au lancement, si une nouvelle version est prête **avant que l'utilisateur ait commencé à travailler**,
   l'application se recharge d'elle-même pour l'appliquer.
6. « Commencé à travailler » veut dire : un caractère tapé ou une mise en forme appliquée, un fichier ouvert ou en
   cours d'ouverture, la question de la copie de secours affichée, ou un document restauré depuis la copie de secours.
   Dans tous ces cas, la mise à jour attend le lancement suivant, comme aujourd'hui (décision du 2026-10-18).
7. Le rechargement ne se produit jamais plus d'une fois par lancement, et aucune boucle de rechargement n'est possible.
8. La décision « recharger maintenant ou attendre » est une fonction pure, testée avec Vitest.

**Numéro de version**

9. Sous « Nano Buro », en haut à gauche, l'en-tête affiche la version de l'application, en IBM Plex Mono 12 px,
   couleur texte discret de la charte.
10. Format : `v<date de construction>·<commit court>`, par exemple `v2026.10.19·a16f19a`. La date est celle de la
    construction, le commit est celui de `main` publié (`GITHUB_SHA` dans l'Action, `git rev-parse` en local).
    Aucune numérotation manuelle à tenir à jour.
11. En développement (`npm run dev`), la version affiche `dev`.
12. La version est aussi disponible pour les tests (par exemple une constante injectée par Vite) et dans le titre
    survolé (`title`) de l'indicateur, pour la retrouver facilement en cas de problème.

## À faire par le product owner (une seule fois)

Sur GitHub : **Settings › Pages › Build and deployment › Source : GitHub Actions**. Sans ce réglage, l'Action
ne peut pas publier. La PR le rappelle dans sa description.

## Note technique

- vite-plugin-pwa garde `registerType: "prompt"` : `onNeedRefresh` applique la mise à jour (`updateSW(true)`)
  seulement si la fonction du critère 8 le permet.
- Utiliser les actions officielles `actions/configure-pages`, `actions/upload-pages-artifact` et `actions/deploy-pages`.
- Mettre à jour `docs/design/README.md` (emplacement et style du numéro de version).

## Tests attendus

- Vitest : la fonction de décision (chaque cas du critère 6, un seul rechargement par lancement), le format de version.
- Playwright : le numéro de version est affiché sous le nom, et `dev` en développement ; la construction avec
  `BASE_PATH=/nano-office/` reste installable (manifeste et service worker trouvés sous ce chemin).

## Hors périmètre

Bandeau « Nouvelle version disponible » (peut venir plus tard), nom de domaine personnalisé, hébergement ailleurs
que GitHub Pages, notes de version.

## Vérification manuelle

1. Après la fusion, ouvrir `https://hnaoai.github.io/nano-office/` dans Chrome sur le Mac, installer l'application,
   noter la version affichée.
2. Fusionner une PR suivante, attendre la fin de l'Action, relancer l'application sans rien taper : la nouvelle
   version s'affiche dès ce lancement.
3. Recommencer en tapant du texte tout de suite : la version ne change qu'au lancement suivant, sans rechargement
   pendant l'écriture.
4. Sur le PC Windows, ouvrir la même adresse dans Edge, installer, couper le wifi, relancer : l'application s'ouvre.
