// Journal des échanges réseau d'une page Playwright (T0e, critère 3) : requêtes HTTP et messages
// WebSocket envoyés par la page ou par son service worker.
import type { BrowserContext, Page } from "@playwright/test";

/** Une requête observée, réduite à ce qui pourrait porter du contenu de document. */
export interface ObservedRequest {
  method: string;
  url: string;
  body: string | null;
}

/** Ce que la page a envoyé sur le réseau depuis l'appel à `watchNetwork`. */
export interface NetworkLog {
  requests: ObservedRequest[];
  webSocketFrames: string[];
}

/**
 * Enregistre tout ce que la page envoie. Appeler avant `page.goto`.
 * Les requêtes du service worker passent par le contexte, d'où l'écoute sur `context`.
 */
export function watchNetwork(page: Page, context: BrowserContext = page.context()): NetworkLog {
  const log: NetworkLog = { requests: [], webSocketFrames: [] };
  context.on("request", (request) => {
    log.requests.push({ method: request.method(), url: request.url(), body: request.postData() });
  });
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => log.webSocketFrames.push(payload.toString()));
  });
  return log;
}

/**
 * Requêtes qui pourraient porter du contenu de document : toute requête autre qu'un GET sans corps
 * vers l'application elle-même, et toute requête ou message contenant `text`.
 * Une liste vide signifie que seuls les fichiers de l'application ont été demandés.
 */
export function suspiciousTraffic(log: NetworkLog, appOrigin: string, text: string): string[] {
  const found: string[] = [];
  for (const { method, url, body } of log.requests) {
    const sameOrigin = new URL(url).origin === appOrigin;
    if (method !== "GET" || body !== null || !sameOrigin || decodeURI(url).includes(text)) {
      found.push(`${method} ${url}${body === null ? "" : ` (corps : ${body.length} caractères)`}`);
    }
  }
  for (const frame of log.webSocketFrames) {
    if (frame.includes(text)) found.push(`WebSocket : ${frame.slice(0, 80)}`);
  }
  return found;
}
