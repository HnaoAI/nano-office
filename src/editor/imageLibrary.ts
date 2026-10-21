// Images d'un document ouvert dans l'éditeur (T1.9) : adresses `blob:` pour l'affichage, adresses
// `data:` pour la copie, et avis quand une image arrive dans le Y.Doc. Une bibliothèque par éditeur.
// Les adresses `blob:` et `data:` restent dans le navigateur : rien ne part sur le réseau (critère 10).
import type * as Y from "yjs";
import { bytesToBase64 } from "../core/base64";
import { IMAGES_MAP_NAME, readImage, storeImage, type StoredImage } from "../core/images";

/** Images d'un document, lues dans la `Y.Map` « images » de son Y.Doc. */
export class ImageLibrary {
  private readonly urls = new Map<string, string>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly onMapChange = (event: Y.YMapEvent<unknown>) => {
    for (const hash of event.keysChanged) {
      this.listeners.get(hash)?.forEach((listener) => {
        listener();
      });
    }
  };

  /** @param ydoc Y.Doc du document affiché, celui de l'extension de collaboration */
  constructor(private readonly ydoc: Y.Doc) {}

  /** Commence à suivre le Y.Doc, à l'ouverture de l'éditeur. */
  attach(): void {
    this.ydoc.getMap(IMAGES_MAP_NAME).observe(this.onMapChange);
  }

  /** Range une image (une seule fois, critère 6) et renvoie son empreinte. */
  store(image: StoredImage): string {
    return storeImage(this.ydoc, image);
  }

  /** Vrai si l'image est rangée dans le document. */
  has(hash: string): boolean {
    return readImage(this.ydoc, hash) !== null;
  }

  /**
   * Adresse `blob:` à afficher, créée une seule fois par image tant que l'éditeur est ouvert, même si
   * l'image apparaît plusieurs fois (document de 20 photos, critère 11).
   * @returns null pour une image manquante (critère 9)
   */
  url(hash: string): string | null {
    const cached = this.urls.get(hash);
    if (cached) return cached;
    const image = readImage(this.ydoc, hash);
    if (!image) return null;
    const url = URL.createObjectURL(new Blob([image.data as BlobPart], { type: image.type }));
    this.urls.set(hash, url);
    return url;
  }

  /** Adresse `data:` de l'image, pour la copie vers une autre application ou une autre fenêtre. */
  dataUrl(hash: string): string | null {
    const image = readImage(this.ydoc, hash);
    return image ? `data:${image.type};base64,${bytesToBase64(image.data)}` : null;
  }

  /**
   * Appelle `listener` quand l'image `hash` est rangée ou retirée (par exemple une image manquante qui
   * arrive plus tard). @returns la fonction qui arrête l'écoute
   */
  subscribe(hash: string, listener: () => void): () => void {
    let set = this.listeners.get(hash);
    if (!set) {
      set = new Set();
      this.listeners.set(hash, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  /**
   * Libère les adresses `blob:` et arrête l'écoute du Y.Doc, à la fermeture de l'éditeur. La
   * bibliothèque peut être rattachée ensuite (React recrée l'éditeur en mode strict).
   */
  detach(): void {
    this.ydoc.getMap(IMAGES_MAP_NAME).unobserve(this.onMapChange);
    this.urls.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    this.urls.clear();
    this.listeners.clear();
  }
}
