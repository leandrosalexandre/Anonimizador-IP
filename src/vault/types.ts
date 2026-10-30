/** Metadados em claro, usados apenas para listar os cofres (SPEC 4). */
export interface VaultMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface KdfParams {
  name: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  salt: Uint8Array<ArrayBuffer>;
}

/** Registro gravado no IndexedDB: metadados em claro + conteúdo apenas cifrado. */
export interface VaultRecord extends VaultMeta {
  formatVersion: 1;
  kdf: KdfParams;
  payload: { iv: Uint8Array<ArrayBuffer>; ciphertext: Uint8Array<ArrayBuffer> };
}

/** Conteúdo cifrado do cofre. As fases seguintes preenchem documentos e entidades. */
export interface VaultContent {
  version: 1;
  documents: unknown[];
  entities: unknown[];
  config: {
    customRoles: string[];
    keepNames: string[];
  };
}

export function emptyVaultContent(): VaultContent {
  return { version: 1, documents: [], entities: [], config: { customRoles: [], keepNames: [] } };
}
