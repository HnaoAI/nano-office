# Charte graphique de Nano Buro

Référence visuelle validée par le product owner le 2026-10-19. Elle fait foi pour toute l'interface :
chaque ticket qui ajoute ou modifie un élément d'interface la respecte.

La maquette est dans `maquette/` (fichiers `.dc.html`, à lire comme des spécifications). Ce sont des
maquettes, pas du code à copier : elles chargent leurs polices depuis Google Fonts, ce que l'application
ne doit jamais faire (règle produit 2).

| Fichier | Contenu |
|---|---|
| `maquette/Main.dc.html` | L'éditeur : en-tête, menu Fichier, indicateur d'enregistrement, barre de mise en forme, page du document, pied de page |
| `maquette/Recuperation.dc.html` | La question « Récupérer / Ouvrir le fichier tel quel » |
| `maquette/Messages.dc.html` | Les trois états de l'indicateur, les informations et les alertes |

## Principes

- **Monochrome.** Aucune couleur d'accent. Le noir est réservé à ce qui est actif ou important :
  bouton principal, bouton de mise en forme activé, état « Non enregistré », alertes.
- **Relief par les ombres**, jamais par des bordures épaisses ou des dégradés.
- **La page au centre** : le document est une feuille blanche qui flotte sur un fond gris clair.
- **Peu de texte d'interface**, des libellés courts, des icônes au trait avec un nom accessible.

## Couleurs

| Rôle | Valeur |
|---|---|
| Fond de l'application | `#ECECEA` |
| Surface (page, barre, cartes) | `#FFFFFF` |
| Surface atténuée (listes déroulantes, puces d'icône, bouton secondaire) | `#F3F3F1` |
| Groupe de boutons, bouton activé clair, séparateur | `#E2E2DF` |
| Séparateur fort | `#D4D4D1` |
| Encre principale, élément actif, alerte | `#121212` |
| Texte du document | `#1B1B1A` |
| Texte secondaire | `#3A3A38` |
| Texte discret (chemin, pied de page, sous-titres) | `#5F5F5C` |
| Bouton désactivé | `#9A9A96` |
| Puce d'icône sur fond noir | `#2A2A29` |

Contrastes : le texte discret `#5F5F5C` reste lisible sur `#ECECEA` (environ 5,4:1). Ne pas l'éclaircir.

## Typographie

- **Interface et texte par défaut** : IBM Plex Sans (400, 500, 600, italique 400).
- **Petites indications** (chemin du fichier, raccourci ⌘S, pied de page, titres de section) : IBM Plex Mono (400, 500), 12 px.
- Tailles de l'interface : 15 px titres de l'en-tête, 14 px boutons et messages, 13 px indicateur, 12 px indications.
- Document : 16 px, interligne 1,65 ; Titre 1 34 px (600) ; Titre 2 21 px (600).

## Formes

| Élément | Rayon | Ombre |
|---|---|---|
| Page du document | 6 px | `0 1px 2px rgba(0,0,0,.04), 0 12px 32px rgba(0,0,0,.08), 0 32px 64px rgba(0,0,0,.05)` |
| Barre de mise en forme | 16 px | `0 1px 2px rgba(0,0,0,.05), 0 10px 30px rgba(0,0,0,.07)` |
| Boutons, listes déroulantes | 10 px | aucune ; bouton principal `0 4px 12px rgba(0,0,0,.2)` |
| Groupe de boutons Fichier | 14 px | aucune, fond `#E2E2DF` |
| Messages | 14 px | information `0 1px 2px rgba(0,0,0,.05), 0 8px 24px rgba(0,0,0,.06)` ; alerte `0 12px 28px rgba(0,0,0,.2)` |
| Boîte de dialogue | 20 px | `0 1px 2px rgba(0,0,0,.06), 0 24px 64px rgba(0,0,0,.16)` |
| Indicateur d'enregistrement | 999 px (pastille) | `0 1px 2px rgba(0,0,0,.06)` |

Boutons de la barre : 40 × 40 px. Boutons de texte : 36 px de haut. Boutons de la boîte de dialogue : 48 px.
Icônes : trait de 1,75 px, 18 px, couleur du texte.

## Comportements

- **Bouton activé** (Gras, Italique) : fond `#121212`, texte blanc. **Alignement activé** : fond `#E2E2DF`.
- **Indicateur** : « Enregistré » (point plein), « Enregistrement… » (point creux), « Non enregistré » (pastille noire).
- **Messages** : une information sur fond blanc avec une puce d'icône grise ; une alerte sur fond noir.
  Les deux ont un bouton de fermeture ; une action éventuelle est à droite.
- **Numéro de version** : sous le nom de l'application, en haut à gauche, IBM Plex Mono 12 px, couleur texte discret `#5F5F5C` (format `v2026.10.19·a16f19a`, ticket H1).
- **Largeur réduite** : l'en-tête et la barre passent à la ligne, la page occupe toute la largeur avec des marges réduites.
