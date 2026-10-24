// Texte de l'aide intégrée (A1), en données structurées, pour que le product owner le relise et le corrige
// directement dans la PR. Aucun rendu Markdown : HelpPanel.tsx affiche ces blocs tels quels.
// INVARIANT : les phrases des messages viennent des mêmes constantes que l'application (critère 4),
// jamais d'une copie : une phrase changée dans l'application change aussi dans l'aide.
import { SAVE_STATE_LABELS } from "../SaveIndicator";
import { PRINT_SHORTCUT, SAVE_SHORTCUT } from "../shortcuts";
import { UPDATE_REASSURANCE, UPDATE_TITLE } from "../updateTexts";
import type { HelpIconName } from "./helpIcons";
import { HELP_MESSAGES } from "./helpMessages";

/**
 * Un bloc d'une section :
 * - `text` : un paragraphe, avec l'icône d'un bouton de l'application à sa gauche s'il en parle ;
 * - `steps` : une liste d'étapes numérotées, sous un petit titre éventuel ;
 * - `message` : la phrase affichée par l'application, puis « que faire » ;
 * - `shortcuts` : le tableau des raccourcis de l'ordinateur utilisé (helpShortcuts.ts).
 */
export type HelpBlock =
  | { kind: "text"; text: string; icon?: HelpIconName }
  | { kind: "steps"; title?: string; items: string[] }
  | { kind: "message"; title: string; shown: string; todo: string }
  | { kind: "shortcuts" };

/** Une section de l'aide, avec son entrée dans le sommaire. */
export interface HelpSection {
  /** Identifiant stable, en anglais, pour le sommaire et les tests. */
  id: string;
  title: string;
  blocks: HelpBlock[];
}

/** Sections de l'aide, dans l'ordre du critère 3. */
export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "install",
    title: "Installer Nano Buro",
    blocks: [
      {
        kind: "text",
        text: "Installé, Nano Buro s'ouvre comme un logiciel, dans sa propre fenêtre, même sans Internet.",
      },
      {
        kind: "steps",
        title: "Sur le Mac, avec Chrome",
        items: [
          "Ouvrez l'adresse de Nano Buro dans Chrome.",
          "Dans la barre d'adresse, tout à droite, cliquez sur l'icône d'installation : un petit écran avec une flèche.",
          "Cliquez sur « Installer ».",
          "Nano Buro s'ouvre dans sa fenêtre. Pour le retrouver, gardez son icône dans le Dock.",
        ],
      },
      {
        kind: "steps",
        title: "Sur le PC, avec Edge",
        items: [
          "Ouvrez l'adresse de Nano Buro dans Edge.",
          "Dans la barre d'adresse, tout à droite, cliquez sur l'icône « Application disponible ».",
          "Cliquez sur « Installer ».",
          "Nano Buro s'ouvre dans sa fenêtre. Pour le retrouver, épinglez-le à la barre des tâches.",
        ],
      },
      {
        kind: "text",
        icon: "install",
        text: "L'adresse de Nano Buro est rappelée en bas de cette aide. Avec Safari ou Firefox, Nano Buro fonctionne, mais chaque enregistrement devient un téléchargement : préférez Chrome ou Edge.",
      },
    ],
  },
  {
    id: "folders",
    title: "Où ranger ses documents",
    blocks: [
      {
        kind: "text",
        icon: "folder",
        text: "Rangez vos documents dans votre dossier synchronisé : OneDrive, Dropbox ou Google Drive. Vous les retrouverez ainsi sur l'autre ordinateur.",
      },
      {
        kind: "steps",
        items: [
          "La première fois, cliquez sur « Enregistrer sous… », choisissez le dossier synchronisé, puis donnez un nom au document.",
          "Ensuite, Nano Buro enregistre tout seul dans ce même fichier, quelques secondes après chaque modification.",
          `« Enregistrer » (${SAVE_SHORTCUT}) enregistre tout de suite, sans rien redemander.`,
          "Pour reprendre un document, cliquez sur « Ouvrir… » et choisissez-le dans le dossier synchronisé.",
        ],
      },
      {
        kind: "text",
        text: "Évitez de travailler sur le même document sur les deux ordinateurs à la fois : Nano Buro vous préviendrait, mais il faudrait choisir quelle version garder.",
      },
    ],
  },
  {
    id: "safety",
    title: "Ne rien perdre",
    blocks: [
      {
        kind: "steps",
        title: "La pastille en haut à droite",
        items: [
          `« ${SAVE_STATE_LABELS.saved} » : tout est dans le fichier.`,
          `« ${SAVE_STATE_LABELS.saving} » : Nano Buro est en train d'écrire le fichier.`,
          `« ${SAVE_STATE_LABELS.unsaved} », sur fond noir : des modifications ne sont pas encore dans le fichier.`,
        ],
      },
      {
        kind: "text",
        icon: "save",
        text: "Enregistrement automatique : dès que le document a un fichier, chaque modification y est enregistrée toute seule, quelques secondes plus tard.",
      },
      {
        kind: "text",
        icon: "backup",
        text: "Copie de secours : tout ce que vous tapez est aussi gardé dans le navigateur de cet ordinateur, même avant le premier enregistrement. Le bas de la fenêtre indique « Copie de secours à jour ».",
      },
      {
        kind: "text",
        text: "Si vous fermez Nano Buro avant que tout soit enregistré, le navigateur vous prévient. Si vous fermez quand même, rien n'est perdu : à la prochaine ouverture, le document revient depuis la copie de secours.",
      },
      {
        kind: "text",
        text: "La copie de secours ne quitte pas cet ordinateur. Pour retrouver un document ailleurs, enregistrez-le dans le dossier synchronisé.",
      },
    ],
  },
  {
    id: "messages",
    title: "Les messages et quoi faire",
    blocks: [
      {
        kind: "message",
        title: "Document récupéré",
        shown: HELP_MESSAGES.recovered,
        todo: "Rien n'est perdu. Cliquez sur « Enregistrer sous… » pour le ranger dans un fichier. Si le document avait déjà un fichier, le message propose « Enregistrer ».",
      },
      {
        kind: "message",
        title: "Fichier modifié ailleurs",
        shown: HELP_MESSAGES.changedElsewhere,
        todo: "Le fichier a sans doute été modifié sur l'autre ordinateur. Pour garder les deux versions, cliquez sur « Enregistrer sous… » et donnez un autre nom. Pour remplacer l'autre version par celle-ci, cliquez sur « Enregistrer ».",
      },
      {
        kind: "message",
        title: "Autorisation à redonner",
        shown: HELP_MESSAGES.permission,
        todo: "Cliquez sur « Autoriser », puis acceptez dans la petite fenêtre du navigateur. Nano Buro enregistre alors le document dans son fichier.",
      },
      {
        kind: "message",
        title: "Fichier abîmé",
        shown: HELP_MESSAGES.corrupted,
        todo: "Gardez ce fichier de côté : il pourra peut-être être récupéré plus tard. Votre dossier synchronisé garde souvent les versions précédentes d'un fichier : essayez d'en ouvrir une.",
      },
      {
        kind: "message",
        title: "Fichier d'une version plus récente",
        shown: HELP_MESSAGES.newerVersion,
        todo: "Le document a été enregistré par un Nano Buro plus récent, sur l'autre ordinateur. Fermez toutes les fenêtres de Nano Buro, rouvrez-le sans rien taper pour qu'il se mette à jour, puis rouvrez le document.",
      },
      {
        kind: "message",
        title: "Échec de l'enregistrement",
        shown: HELP_MESSAGES.saveFailed,
        todo: "Vos modifications restent dans la copie de secours. Réessayez « Enregistrer ». Si cela échoue encore, le dossier a peut-être été déplacé ou le disque est plein : choisissez un autre dossier avec « Enregistrer sous… ».",
      },
    ],
  },
  {
    id: "format",
    title: "Mettre en forme",
    blocks: [
      {
        kind: "text",
        icon: "heading",
        text: "Titres : choisissez « Titre 1 », « Titre 2 » ou « Titre 3 » dans la liste du style, à gauche de la barre. « Texte normal » revient au texte courant.",
      },
      {
        kind: "text",
        icon: "list",
        text: "Listes : « Liste à puces » ou « Liste numérotée ». La touche Tab décale un élément vers la droite, Shift+Tab vers la gauche.",
      },
      {
        kind: "text",
        text: "Gras, italique et barré : sélectionnez le texte, puis cliquez sur « Gras », « Italique » ou « Barré ». « Aa » passe la sélection en MAJUSCULES, en minuscules ou avec une majuscule au début de chaque phrase.",
      },
      {
        kind: "text",
        icon: "color",
        text: "Couleurs : sélectionnez le texte, puis « Couleur du texte » ou « Surlignage », et choisissez une pastille.",
      },
      {
        kind: "text",
        icon: "table",
        text: "Tableaux : « Insérer un tableau », puis choisissez sa taille dans la grille. Quand le curseur est dans un tableau, des boutons apparaissent dans la barre pour ajouter ou retirer des lignes et des colonnes.",
      },
      {
        kind: "text",
        icon: "image",
        text: "Images : « Insérer une image », ou collez-la, ou faites-la glisser dans le document. Pour la décrire, cliquez sur l'image, puis sur « Texte de remplacement ».",
      },
      {
        kind: "text",
        icon: "lineHeight",
        text: "Interligne : la liste « Interligne » règle l'espace entre les lignes du paragraphe.",
      },
      {
        kind: "text",
        icon: "page",
        text: "Mise en page : « Mise en page… », au bout de la barre, choisit l'orientation de la feuille et ses marges.",
      },
      {
        kind: "text",
        text: "Plan : le bouton « Plan », au bout de la barre, liste les titres du document avec leur page. Cliquez sur un titre pour y aller. Faites-le glisser pour déplacer toute sa partie, ou utilisez Alt+Shift et une flèche (Option+Shift sur Mac).",
      },
      {
        kind: "text",
        text: "Rechercher et remplacer : la recherche s'ouvre avec le raccourci indiqué dans « Raccourcis clavier ». Tapez le mot cherché, puis passez d'un résultat à l'autre avec Entrée. « Remplacer… » permet de remplacer un mot ou tous à la fois. Un seul « Annuler » remet tout comme avant.",
      },
      {
        kind: "text",
        text: "Nano Buro ne met rien en forme tout seul pendant que vous tapez : ce que vous écrivez reste tel quel.",
      },
    ],
  },
  {
    id: "print",
    title: "Imprimer, PDF et Word",
    blocks: [
      {
        kind: "text",
        icon: "print",
        text: `Cliquez sur « Imprimer » (${PRINT_SHORTCUT}). Seule la page du document s'imprime, sans les boutons.`,
      },
      {
        kind: "text",
        text: "Pour créer un PDF, choisissez « Enregistrer au format PDF » à la place de l'imprimante.",
      },
      {
        kind: "text",
        text: "Dans « Plus de paramètres », décochez la case « En-têtes et pieds de page » : sinon le navigateur ajoute la date, le nom et l'adresse en haut et en bas de chaque page.",
      },
      {
        kind: "text",
        icon: "word",
        text: "« Exporter en Word… » crée une copie au format Word (.docx), à envoyer par exemple. Votre document reste le fichier Nano Buro : continuez à travailler dans celui-ci.",
      },
    ],
  },
  {
    id: "shortcuts",
    title: "Raccourcis clavier",
    blocks: [
      { kind: "text", text: "Les touches affichées sont celles de cet ordinateur." },
      {
        kind: "text",
        text: "Sur un clavier français, la barre / s'obtient avec Shift et la touche « : ».",
      },
      { kind: "shortcuts" },
    ],
  },
  {
    id: "updates",
    title: "Mises à jour",
    blocks: [
      {
        kind: "text",
        text: "Nano Buro se met à jour tout seul, à l'ouverture, si une nouvelle version existe et que vous n'avez encore rien commencé.",
      },
      {
        kind: "text",
        icon: "update",
        text: `La fenêtre « ${UPDATE_TITLE} » s'affiche alors quelques secondes : ${UPDATE_REASSURANCE} Un message indique ensuite le numéro de la nouvelle version.`,
      },
      {
        kind: "text",
        text: "Si vous avez déjà commencé à travailler, la mise à jour attend la prochaine ouverture : elle ne vous interrompt jamais.",
      },
      {
        kind: "text",
        text: "Le numéro de version est écrit sous le nom « Nano Buro », en haut à gauche, et en bas de cette aide.",
      },
    ],
  },
  {
    id: "privacy",
    title: "Confidentialité",
    blocks: [
      {
        kind: "text",
        icon: "lock",
        text: "Vos documents restent sur votre ordinateur et dans votre dossier synchronisé. Nano Buro n'envoie rien sur Internet : il ne fait que télécharger ses propres mises à jour. Seule exception, l'assistant IA, si vous décidez de l'allumer. Pas de publicité, pas de compte à créer.",
      },
      {
        kind: "text",
        icon: "settings",
        text: "L'assistant IA est facultatif, et éteint au départ. Si vous l'allumez dans les « Réglages », seul le texte que vous sélectionnez est envoyé, après un clic sur « Corriger » ou « Traduire en anglais », au fournisseur choisi (Claude ou Gemini), avec votre propre clé. Cette clé reste sur cet ordinateur.",
      },
    ],
  },
];
