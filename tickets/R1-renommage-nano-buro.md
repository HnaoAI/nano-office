# R1 : Renommer l'application en Nano Buro

**Suivi** : Issue [#30](https://github.com/HnaoAI/nano-office/issues/30), le statut se lit sur le tableau Kanban
**Dépend de** : U1a (PR #29 fusionnée)
**Taille estimée** : S
**Branche** : `ticket/R1-renommage-nano-buro`

## User story

En tant que product owner, je veux que l'application s'appelle **Nano Buro**, partout où on la voit,
avant que la famille commence à l'utiliser.

Orthographe exacte : **Nano Buro**, deux majuscules, sans accent.

## Critères d'acceptation

**Ce qui change : tout ce qui est visible**

1. L'en-tête affiche « Nano Buro ».
2. Le titre de la fenêtre se termine par « - Nano Buro » (par exemple « lettre.nano - Nano Buro »).
3. Le manifeste de la PWA a `name` et `short_name` « Nano Buro », et `index.html` a pour titre « Nano Buro ».
4. Les messages affichés disent « Nano Buro » (par exemple « Ce fichier n'est pas un document Nano Buro. »).
5. Le type de fichier proposé par les sélecteurs s'appelle « Document Nano Buro ».
6. La documentation et le cadrage disent « Nano Buro » : `README.md`, `CLAUDE.md` (hors journal des décisions),
   `docs/contexte-produit.md`, `docs/design/README.md`, les maquettes de `docs/design/maquette/` et les tickets
   pas encore livrés. Les commentaires du code aussi.

**Ce qui ne change pas : les noms techniques invisibles**

7. Le champ `format` des fichiers reste `"nano-office"` : les fichiers déjà enregistrés s'ouvrent toujours, sans migration.
   Ajouter près de `NANO_FORMAT` un commentaire `INVARIANT :` qui l'explique.
8. Le préfixe des copies de secours (`nano-office-backup:`) et la clé du dernier document modifié ne changent pas :
   les copies existantes restent récupérables.
9. L'extension `.nano`, le nom du paquet npm, les variables CSS `--nano-…` et le nom du dépôt GitHub ne changent pas.
10. Les entrées passées du journal des décisions ne sont pas réécrites : on ajoute une nouvelle entrée.

**Tests**

11. Les tests qui vérifient le texte « Nano Office » sont mis à jour vers « Nano Buro ». C'est une décision du
    product owner qui change le comportement attendu : la PR l'indique clairement et liste les fichiers de test
    touchés. Aucune autre assertion n'est modifiée.
12. Un test vérifie qu'un fichier enregistré avant le renommage (avec `"format": "nano-office"`) s'ouvre toujours.
13. Une recherche de « Nano Office » dans `src/` et `tests/` ne renvoie plus rien, sauf les identifiants techniques
    des critères 7 et 8.

## Hors périmètre

Logo définitif (le « N » reste valable), nom de domaine, renommage du dépôt GitHub, vérification de la marque
auprès de l'INPI et de l'EUIPO.

## Vérification manuelle

Sur le Mac avec Chrome :
1. Lancer l'application et vérifier le nom dans l'en-tête et dans l'onglet.
2. Ouvrir un fichier `.nano` enregistré avant le renommage : il s'ouvre normalement.
3. Construire la version installable (`npm run build` puis `npx vite preview`), réinstaller l'application
   si besoin, et vérifier qu'elle s'appelle Nano Buro (Spotlight, Dock).
