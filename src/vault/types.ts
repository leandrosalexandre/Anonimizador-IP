import type { Decision, EntityType } from '../detectors/types';

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
  /** Trechos [início, fim) de `text` com palavras de baixa confiança no OCR. */
  ocrLowConfidence?: [number, number][];
  /** Data da última correção manual do texto. */
  textEditedAt?: string;
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

/**
 * Entidade revisada (SPEC 4, `entidades[]`). O marcador ("rótulo") é calculado a partir do papel
 * e do índice. Os índices são renumerados sem lacunas após unificar ou descartar, mas só enquanto
 * nenhum texto foi exportado (uma análise já devolvida pela IA usa os números antigos). As
 * ocorrências são recalculadas a partir das variantes sobre o texto atual das páginas (ver
 * src/review/locate.ts).
 */
export interface StoredEntity {
  id: string;
  type: EntityType;
  /** Papel (pessoas): um dos papéis padrão ou um papel criado pelo usuário. */
  role: string | null;
  /** Número no marcador ([VÍTIMA 1], [CPF 2]). */
  index: number | null;
  canonical: string;
  variants: string[];
  decision: Decision;
  /** O usuário já revisou (aceitou, alterou ou criou) esta entidade. */
  reviewed: boolean;
  /** Pessoa a que o dado pertence (CPF, endereço, apelido…). */
  linkedTo: string | null;
  /** Outras entidades com que pode ser confundida (sugestão de mesclagem). */
  ambiguousWith: string[];
  source: 'detected' | 'manual';
  confidence: number;
  /**
   * Sugestão sem sinal forte (fora de qualificação, sem gatilho, sem prenome conhecido): não é
   * substituída até o usuário aceitá-la na revisão.
   */
  suggested?: boolean;
  /** Papéis diferentes encontrados nas peças (mostrados como conflito na revisão). */
  roleConflicts?: string[];
}

/**
 * Análise devolvida pela IA, guardada como veio (pseudonimizada). A reidentificação é refeita ao
 * abrir, para não duplicar nomes reais no cofre e acompanhar correções da revisão.
 */
export interface StoredAnalysis {
  id: string;
  title: string;
  createdAt: string;
  text: string;
}

/** Conteúdo cifrado do cofre. */
export interface VaultContent {
  version: 1;
  documents: StoredDocument[];
  entities: StoredEntity[];
  analyses?: StoredAnalysis[];
  config: {
    customRoles: string[];
    keepNames: string[];
    /** Variantes descartadas como falso positivo (não voltam numa nova detecção). */
    dismissed?: string[];
    /** Data da última detecção automática. */
    detectedAt?: string;
    /** Itens da varredura residual confirmados como não pessoais. */
    residualIgnored?: string[];
    /** Pares de entidades que o usuário decidiu manter separadas ("não é a mesma pessoa"). */
    separate?: [string, string][];
    /** Data da primeira cópia ou download do texto exportado (depois disso, não renumera). */
    exportedAt?: string;
  };
}

export function emptyVaultContent(): VaultContent {
  return { version: 1, documents: [], entities: [], config: { customRoles: [], keepNames: [] } };
}
