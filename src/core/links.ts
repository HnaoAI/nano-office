// Liens (T2.12) : adresses acceptées (http, https, mailto), adresse tapée complétée (`https://`, `mailto:`), texte
// affiché d'une adresse, et marque `link` du schéma (extension Tiptap Link, MIT). Sans navigateur.
import Link from "@tiptap/extension-link";
import { TEXT_COLORS } from "./documentColors";

/** Protocoles acceptés (critère 2) : pages web et adresses e-mail. `javascript:`, `data:` et les autres sont refusés. */
export const LINK_PROTOCOLS = ["http:", "https:", "mailto:"] as const;

/** Bleu du lien (critère 3) : celui de la palette du document (T1.7). */
export const LINK_COLOR = TEXT_COLORS.find(({ name }) => name === "Bleu")?.value ?? "#1565C0";

const EMAIL = /^[^\s@:/]+@[^\s@:/]+\.[^\s@:/]+$/u;
const SCHEME = /^[a-z][a-z0-9+.-]*:/iu;

/**
 * Vrai si l'adresse est un lien accepté (critère 2) : `http` ou `https` avec un nom de site, ou `mailto` avec une
 * adresse. Les espaces et caractères de contrôle sont refusés, pour qu'un `java\nscript:` ne passe pas.
 */
export function isAllowedLinkUrl(url: unknown): url is string {
  if (typeof url !== "string" || url === "" || /[\s\p{Cc}]/u.test(url)) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!(LINK_PROTOCOLS as readonly string[]).includes(parsed.protocol)) return false;
  if (parsed.protocol === "mailto:") {
    // Une adresse mal encodée (« caf%E9@… », vieux sites en Latin-1) est refusée, jamais une exception : elle
    // ferait perdre le collage, ou empêcherait d'ouvrir le document qui la contient.
    try {
      return EMAIL.test(decodeURIComponent(parsed.pathname));
    } catch {
      return false;
    }
  }
  return parsed.hostname !== "";
}

/**
 * Adresse d'un lien à partir de ce que l'utilisateur a tapé ou collé (critère 1) : une adresse sans protocole
 * reçoit `https://`, une adresse e-mail devient `mailto:`. Renvoie null pour une adresse refusée (critère 2) ou
 * qui ne ressemble pas à un site (« bonjour » n'a pas de point).
 */
export function normalizeLinkInput(input: string): string | null {
  const text = input.trim();
  if (text === "") return null;
  if (EMAIL.test(text)) return `mailto:${text}`;
  if (SCHEME.test(text) && !/^[^:/]+\.[^:/]+:\d+/u.test(text)) {
    // Protocole en minuscules (« MAILTO: » devient « mailto: »), pour que le texte affiché le retire aussi.
    const url = text.replace(SCHEME, (scheme) => scheme.toLowerCase());
    return isAllowedLinkUrl(url) ? url : null;
  }
  const url = `https://${text.replace(/^\/+/u, "")}`;
  if (!isAllowedLinkUrl(url)) return null;
  const host = new URL(url).hostname;
  return host.includes(".") || host === "localhost" ? url : null;
}

/** Texte d'une adresse pour l'utilisateur : sans `mailto:` pour une adresse e-mail. */
export function linkLabel(href: string): string {
  return href.startsWith("mailto:") ? href.slice("mailto:".length) : href;
}

/**
 * Lien (T2.12) : marque `link` qui ne garde que son adresse (`href`), rendue en `<a>` souligné en bleu, ouvert dans
 * un nouvel onglet sans lien avec la page (`noopener`). Relue depuis `<a href>` seulement si l'adresse est
 * acceptée : un collage du web ou de Word garde ses liens, jamais un `javascript:` (critères 2 et 5).
 * - `autolink` désactivé : taper une adresse ne crée pas de lien (règle produit 6, critère 4) ;
 * - `linkOnPaste` : coller une adresse sur un texte sélectionné en fait un lien, si l'adresse est acceptée ;
 * - `openOnClick` désactivé : un clic place le curseur ; Ctrl/Cmd+clic ouvre (src/editor/links.ts).
 * La couleur et le soulignement sont en style, pour s'afficher aussi dans un e-mail, à l'impression et dans le PDF.
 */
export const DocumentLink = Link.extend({
  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (element) => element.getAttribute("href"),
      },
    };
  },
}).configure({
  openOnClick: false,
  enableClickSelection: false,
  autolink: false,
  linkOnPaste: true,
  defaultProtocol: "https",
  HTMLAttributes: {
    target: "_blank",
    rel: "noopener noreferrer",
    style: `color: ${LINK_COLOR}; text-decoration: underline`,
  },
  isAllowedUri: (url) => isAllowedLinkUrl(url),
  shouldAutoLink: (url) => normalizeLinkInput(url) !== null,
});
