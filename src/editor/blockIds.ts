// Génération des identifiants de bloc dans l'éditeur (T0b, critère 6 ; règle produit 5).
// L'attribut lui-même est défini par `BlockId` dans src/core/schema.ts : ce fichier ne fait que le remplir.
// Écrit à la main plutôt qu'avec l'extension UniqueID de Tiptap, qui redéfinirait son propre attribut
// au lieu de réutiliser celui du schéma partagé (voir la note technique du ticket T0b).
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { BLOCK_ID_ATTRIBUTE, BLOCK_TYPES_WITH_ID } from "../core/schema";

/** Clé du plugin, pour le retrouver dans l'état de l'éditeur. */
export const blockIdPluginKey = new PluginKey("blockIdGenerator");

/** Méta posée sur la transaction qui attribue des identifiants, pour la reconnaître. */
export const BLOCK_IDS_ASSIGNED_META = "blockIdsAssigned";

/**
 * Crée le plugin qui donne un identifiant à chaque bloc qui n'en a pas, ou dont l'identifiant
 * est déjà porté par un autre bloc (par exemple après un collage).
 *
 * En cas de doublon, le bloc qui portait déjà cet identifiant avant la modification le garde ;
 * l'autre en reçoit un nouveau. Ainsi un identifiant reste attaché au même bloc.
 *
 * Historique : si la modification vient de l'utilisateur, l'attribution rejoint la même étape
 * d'annulation. Sinon (contenu reçu de Yjs, annulation, rétablissement), elle est marquée
 * `addToHistory: false`, pour que Ctrl/Cmd+Z n'efface pas un identifiant à lui seul.
 *
 * @param generateId fabrique un identifiant neuf ; UUID version 4 par défaut
 * @returns un plugin ProseMirror
 */
export function createBlockIdPlugin(generateId: () => string = () => crypto.randomUUID()): Plugin {
  return new Plugin({
    key: blockIdPluginKey,
    appendTransaction(transactions, oldState, newState) {
      const changes = transactions.filter((tr) => tr.docChanged);
      if (changes.length === 0) {
        return null;
      }
      const owners = previousOwners(oldState.doc, changes);
      const seen = new Set<string>();
      const tr = newState.tr;
      newState.doc.descendants((node, pos) => {
        if (!BLOCK_TYPES_WITH_ID.includes(node.type.name)) {
          return true;
        }
        const id: unknown = node.attrs[BLOCK_ID_ATTRIBUTE];
        const needsNewId =
          typeof id !== "string" ||
          id === "" ||
          seen.has(id) ||
          isClaimedLater(newState.doc, id, pos, owners);
        if (needsNewId) {
          const newId = generateId();
          tr.setNodeAttribute(pos, BLOCK_ID_ATTRIBUTE, newId);
          seen.add(newId);
        } else {
          seen.add(id);
        }
        return true;
      });
      if (!tr.docChanged) {
        return null;
      }
      tr.setMeta(BLOCK_IDS_ASSIGNED_META, true);
      if (!changes.some((change) => change.getMeta("addToHistory") !== false)) {
        tr.setMeta("addToHistory", false);
      }
      return tr;
    },
  });
}

/**
 * Pour chaque identifiant présent avant la modification, position actuelle du bloc qui le portait
 * (position d'avant, reportée à travers les transactions). Absent si ce bloc a été supprimé.
 */
function previousOwners(oldDoc: ProseMirrorNode, changes: Transaction[]): Map<string, number> {
  const owners = new Map<string, number>();
  oldDoc.descendants((node, pos) => {
    const id: unknown = node.attrs[BLOCK_ID_ATTRIBUTE];
    if (BLOCK_TYPES_WITH_ID.includes(node.type.name) && typeof id === "string" && id !== "") {
      let mapped: number | null = pos;
      for (const change of changes) {
        const result = change.mapping.mapResult(mapped, 1);
        mapped = result.deleted ? null : result.pos;
        if (mapped === null) {
          break;
        }
      }
      if (mapped !== null && !owners.has(id)) {
        owners.set(id, mapped);
      }
    }
    return true;
  });
  return owners;
}

/**
 * Indique si l'identifiant `id`, vu à la position `pos`, appartient en fait à un bloc plus loin
 * dans le document (son propriétaire d'avant la modification). Dans ce cas, le bloc en `pos`
 * est la copie et doit changer d'identifiant.
 */
function isClaimedLater(
  doc: ProseMirrorNode,
  id: string,
  pos: number,
  owners: Map<string, number>,
): boolean {
  const ownerPos = owners.get(id);
  if (ownerPos === undefined || ownerPos <= pos) {
    return false;
  }
  const owner = doc.nodeAt(ownerPos);
  return owner !== null && owner.attrs[BLOCK_ID_ATTRIBUTE] === id;
}

/** Extension Tiptap qui installe `createBlockIdPlugin` avec des UUID. */
export const BlockIdGenerator = Extension.create({
  name: "blockIdGenerator",
  addProseMirrorPlugins() {
    return [createBlockIdPlugin()];
  },
});
