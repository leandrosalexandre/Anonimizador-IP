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

/** Arquivo binário do cofre (PDF original, miniaturas), gravado apenas cifrado. */
export interface BlobRecord {
  /** `${vaultId}/${blobId}` */
  key: string;
  vaultId: string;
  blobId: string;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: Uint8Array<ArrayBuffer>;
}

export type PageKind = 'text' | 'image';
export type TextSource = 'pdf' | 'ocr';

/** Página de um documento (SPEC 4, `pagina`). A folha final é calculada por resolveFolhas. */
export interface StoredPage {
  pdfPage: number;
  width: number;
  height: number;
  kind: PageKind;
  /** Origem do texto atual; null se a página ainda não tem texto (imagem sem OCR). */
  textSource: TextSource | null;
  ocrConfidence: number | null;
  text: string;
  folhaDetected: number | null;
  folhaManual: number | null;
  thumbnailBlobId: string | null;
}

/** Documento importado (SPEC 4, `documentos[]`). */
export interface StoredDocument {
  id: string;
  fileName: string;
  sha256: string;
  byteLength: number;
  importedAt: string;
  /** PDF original, cifrado num registro à parte (necessário para o OCR). */
  pdfBlobId: string;
  /** "A página 1 do PDF corresponde à fls. 1 + offset". */
  folhaOffset: number | null;
  pages: StoredPage[];
}

/** Conteúdo cifrado do cofre. As fases seguintes preenchem as entidades. */
export interface VaultContent {
  version: 1;
  documents: StoredDocument[];
  entities: unknown[];
  config: {
    customRoles: string[];
    keepNames: string[];
  };
}

export function emptyVaultContent(): VaultContent {
  return { version: 1, documents: [], entities: [], config: { customRoles: [], keepNames: [] } };
}
