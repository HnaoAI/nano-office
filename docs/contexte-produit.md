# Nano Office : contexte produit

Fiche de référence pour le travail de product owner. Les règles techniques sont dans `CLAUDE.md`, les règles générales dans `CLAUDE-utilisateur.md`.

## Vision

Un traitement de texte sobre, qui fait le travail courant sans rien imposer : pas de publicité, pas d'assistant IA, pas de mise en forme automatique surprise, et aucun document perdu.

## Statut

- **Projet pilote** pour un usage familial, sur des Mac et des PC Windows, avec Chrome ou Edge.
- Objectif du pilote : que la famille l'utilise pour de vrais documents pendant plusieurs semaines, et apprendre de ses retours.
- La concurrence (Pages, LibreOffice, Google Docs) n'est pas un sujet à ce stade.

## Ce qui a guidé les choix

Les plaintes récentes sur Word (2025-2026) portent surtout sur : publicités et incitations à payer dans l'application, régressions après mise à jour, plantages, mise en page instable (en-têtes, images, tableaux), corrections automatiques intrusives, collage qui change la police. Les règles produit de Nano Office répondent directement à ces points.

## Architecture en bref

PWA (application web installable, hors ligne), TypeScript, React, Tiptap, Yjs. Vrais fichiers `.nano` enregistrés sur le disque, copie de secours dans le navigateur. Yjs prépare la collaboration en ligne sans serveur pour l'instant. Code sur GitHub. Documents de la famille dans un dossier synchronisé (OneDrive, Dropbox ou Google Drive).

## Feuille de route

| Tranche | Contenu | Statut |
|---|---|---|
| T0 : squelette | Découpé en T0a format et outillage, T0b éditeur, T0c ouvrir et enregistrer, T0d copie de secours, T0e PWA hors ligne | Tickets écrits, corrections validées le 2026-10-18 |
| T1 : écrire au quotidien | Titres, listes, alignement, police et taille, copier-coller propre, sauvegarde automatique | User stories écrites (T1.1 à T1.6) |
| T2 : partager | Export PDF via l'impression du navigateur, impression, import `.docx` | À écrire |
| T3 : confort | Tableaux, couleur et surlignage, rechercher et remplacer, nombre de mots | À écrire |
| T4 : mise en page | Marges, orientation, en-têtes, pieds de page, affichage en pages | À écrire (risque technique : Tiptap n'affiche pas les pages nativement) |
| Plus tard | Module tableur, historique des versions, synchronisation, collaboration en ligne, traduction locale | Non planifié |

Ordre conseillé : T0a à T0e dans l'ordre, puis T1.6 (sauvegarde automatique), puis le reste de T1. Quelques jours d'usage en famille entre chaque tranche, et l'ordre peut changer selon leurs retours.

## Organisation du travail

| Étape | Où | Qui |
|---|---|---|
| Écrire et affiner les tickets, arbitrer | Projet claude.ai | Product owner et Claude |
| Valider le ticket | Projet claude.ai | Product owner |
| Coder, tester, commiter sur une branche | Claude Code sur le Mac, modèle Opus | Claude Code |
| Vérification manuelle (Mac avec Chrome, PC avec Edge) | Ordinateurs de la famille | Product owner |
| Relecture du ticket terminé | Nouvelle session Claude Code | Claude Code |
| Fusion dans `main` | GitHub | Product owner |

## Questions ouvertes

- Disponibilité du nom « Nano Office » (INPI, EUIPO, domaines).
- Hébergement de la PWA : Cloudflare Pages ou Netlify (dépôt privé), à décider après T0.
- Place du tableur : second module, avec sa propre story map.
- Retours de la famille après T0 et T1.
