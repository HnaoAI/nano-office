// Conversion d'une police WOFF (version 1) en police TrueType, pour l'embarquer dans un fichier Word
// (T2.7, critère 4) : Word n'accepte que des polices TrueType ou OpenType. Logique pure : n'utilise que
// `DecompressionStream`, présent dans les navigateurs cibles et dans Node.
// Format : https://www.w3.org/TR/WOFF/ (en-tête de 44 octets, table des tables de 20 octets chacune).

const WOFF_SIGNATURE = 0x774f4646; // « wOFF »
const WOFF_HEADER_SIZE = 44;
const WOFF_TABLE_ENTRY_SIZE = 20;
const SFNT_HEADER_SIZE = 12;
const SFNT_TABLE_ENTRY_SIZE = 16;

interface WoffTable {
  tag: number;
  offset: number;
  compressedLength: number;
  length: number;
  checksum: number;
}

/** Décompresse un bloc zlib (une table de la police). */
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Arrondit au multiple de 4 supérieur : les tables d'une police TrueType sont alignées sur 4 octets. */
function align4(value: number): number {
  return (value + 3) & ~3;
}

/**
 * Police TrueType (ou OpenType) contenue dans un fichier WOFF version 1.
 * @param woff contenu du fichier `.woff`
 * @returns contenu du fichier `.ttf` équivalent, tables dans le même ordre, sommes de contrôle gardées
 * @throws si ce n'est pas un WOFF valide
 */
export async function woffToSfnt(woff: Uint8Array): Promise<Uint8Array> {
  const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  if (woff.byteLength < WOFF_HEADER_SIZE || view.getUint32(0) !== WOFF_SIGNATURE) {
    throw new Error("Police WOFF invalide");
  }
  const flavor = view.getUint32(4);
  const numTables = view.getUint16(12);
  const tables: WoffTable[] = [];
  for (let index = 0; index < numTables; index++) {
    const entry = WOFF_HEADER_SIZE + index * WOFF_TABLE_ENTRY_SIZE;
    if (entry + WOFF_TABLE_ENTRY_SIZE > woff.byteLength) throw new Error("Police WOFF tronquée");
    tables.push({
      tag: view.getUint32(entry),
      offset: view.getUint32(entry + 4),
      compressedLength: view.getUint32(entry + 8),
      length: view.getUint32(entry + 12),
      checksum: view.getUint32(entry + 16),
    });
  }
  const contents = await Promise.all(
    tables.map(async (table) => {
      if (table.offset + table.compressedLength > woff.byteLength) {
        throw new Error("Police WOFF tronquée");
      }
      const raw = woff.subarray(table.offset, table.offset + table.compressedLength);
      const data = table.compressedLength < table.length ? await inflate(raw) : raw;
      if (data.byteLength !== table.length) throw new Error("Table de police abîmée");
      return data;
    }),
  );

  const directorySize = SFNT_HEADER_SIZE + numTables * SFNT_TABLE_ENTRY_SIZE;
  const total = tables.reduce((size, table) => size + align4(table.length), directorySize);
  const sfnt = new Uint8Array(total);
  const out = new DataView(sfnt.buffer);
  // En-tête : valeurs de recherche binaire calculées comme le demande la spécification OpenType.
  const power = 2 ** Math.floor(Math.log2(Math.max(numTables, 1)));
  out.setUint32(0, flavor);
  out.setUint16(4, numTables);
  out.setUint16(6, power * 16);
  out.setUint16(8, Math.log2(power));
  out.setUint16(10, numTables * 16 - power * 16);
  let offset = directorySize;
  tables.forEach((table, index) => {
    const entry = SFNT_HEADER_SIZE + index * SFNT_TABLE_ENTRY_SIZE;
    out.setUint32(entry, table.tag);
    out.setUint32(entry + 4, table.checksum);
    out.setUint32(entry + 8, offset);
    out.setUint32(entry + 12, table.length);
    sfnt.set(contents[index] as Uint8Array, offset);
    offset += align4(table.length);
  });
  return sfnt;
}
