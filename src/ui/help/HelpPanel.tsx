// Panneau d'aide à droite de la page (A1, critères 1 à 7), au style d'un panneau de la barre :
// sommaire cliquable, une section par sujet (helpContent.ts), tableau des raccourcis de l'ordinateur
// utilisé (helpShortcuts.ts), version et adresse de l'application en bas. Rien n'est chargé sur le réseau.
import { useEffect, useEffectEvent, useRef } from "react";
import { isMacPlatform } from "../../editor/platform";
import { APP_VERSION } from "../appVersion";
import { CloseIcon } from "../icons";
import { HELP_SECTIONS, type HelpBlock } from "./helpContent";
import { HelpBlockIcon } from "./helpIcons";
import { helpShortcutGroups, shortcutKeys } from "./helpShortcuts";

/** Adresse de l'application, celle de la page affichée (critère 7) : GitHub Pages une fois publiée. */
function appAddress(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}

/** Tableau des raccourcis, avec les touches de cet ordinateur (critère 3.7). */
function ShortcutTable() {
  const mac = isMacPlatform();
  return (
    <table className="nano-help-shortcuts">
      {helpShortcutGroups(mac).map((group) => (
        <tbody key={group.title}>
          <tr>
            <th colSpan={2} scope="colgroup">
              {group.title}
            </th>
          </tr>
          {group.shortcuts.map((shortcut) => (
            <tr key={`${shortcut.label}-${shortcut.code}`}>
              <td>{shortcut.label}</td>
              <td>
                <kbd>{shortcutKeys(shortcut, mac)}</kbd>
              </td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

/** Un bloc d'une section. */
function Block({ block }: { block: HelpBlock }) {
  switch (block.kind) {
    case "text":
      return (
        <p className={block.icon ? "nano-help-text nano-help-with-icon" : "nano-help-text"}>
          {block.icon && (
            <span className="nano-help-icon" aria-hidden="true">
              <HelpBlockIcon name={block.icon} />
            </span>
          )}
          <span>{block.text}</span>
        </p>
      );
    case "steps":
      return (
        <div className="nano-help-steps">
          {block.title && <h4>{block.title}</h4>}
          <ol>
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      );
    case "message":
      return (
        <div className="nano-help-message">
          <h4>{block.title}</h4>
          <p className="nano-help-shown">{block.shown}</p>
          <p>
            <strong>Que faire : </strong>
            {block.todo}
          </p>
        </div>
      );
    case "shortcuts":
      return <ShortcutTable />;
  }
}

/**
 * Panneau d'aide. Il n'est pas dans le document : il ne s'imprime pas (print.css) et n'est jamais
 * enregistré (critère 6).
 * @param onClose ferme le panneau (bouton de fermeture, Échap)
 */
export function HelpPanel({ onClose }: { onClose: () => void }) {
  const title = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    title.current?.focus();
  }, []);

  // Échap ferme le panneau, sauf si un autre élément l'a déjà utilisé (recherche, petite fenêtre de la barre).
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    onClose();
  });
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function goTo(id: string) {
    const heading = body.current?.querySelector<HTMLElement>(`#nano-help-${id}`);
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  }

  const address = appAddress();
  return (
    <aside className="nano-help" aria-labelledby="nano-help-title">
      <div className="nano-help-header">
        <h2 id="nano-help-title" ref={title} tabIndex={-1}>
          Aide
        </h2>
        <button
          type="button"
          className="nano-help-close"
          aria-label="Fermer l'aide"
          title="Fermer l'aide (Échap)"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="nano-help-body" ref={body}>
        <nav className="nano-help-contents" aria-label="Sommaire de l'aide">
          <ol>
            {HELP_SECTIONS.map((section) => (
              <li key={section.id}>
                <button type="button" onClick={() => goTo(section.id)}>
                  {section.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        {HELP_SECTIONS.map((section) => (
          <section
            key={section.id}
            className="nano-help-section"
            aria-labelledby={`nano-help-${section.id}`}
          >
            <h3 id={`nano-help-${section.id}`} tabIndex={-1}>
              {section.title}
            </h3>
            {section.blocks.map((block, index) => (
              <Block key={index} block={block} />
            ))}
          </section>
        ))}
        <footer className="nano-help-footer">
          <span>Nano Buro {APP_VERSION}</span>
          <a href={address} target="_blank" rel="noopener">
            {address}
          </a>
        </footer>
      </div>
    </aside>
  );
}
