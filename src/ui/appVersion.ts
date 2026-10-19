// Version de l'application, calculée à la construction par vite.config.ts (ticket H1, critères 10 à 12).

declare const __APP_VERSION__: string;

/** `dev` en développement, `v<AAAA.MM.JJ>·<commit court>` dans la version construite. */
export const APP_VERSION: string = __APP_VERSION__;
