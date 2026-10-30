// Arquivo .ipcofre (SPEC Fase 1): JSON com metadados em claro e conteúdo cifrado, protegido pela
// própria senha do cofre. Serve para levar o inquérito a outro aparelho.
import { PBKDF2_MIN_ITERATIONS, IV_BYTES, SALT_BYTES } from './crypto';
import { base64ToBytes, bytesToBase64 } from './encoding';
import {
  MAX_VAULT_NAME_LENGTH,
  blobKey,
  getVaultRecord,
  listBlobRecords,
  openRecord,
  putVaultRecord,
  type UnlockedVault,
} from './repository';
import { getDb } from './db';
import type { BlobRecord, VaultMeta, VaultRecord } from './types';

export const VAULT_FILE_EXTENSION = '.ipcofre';
export const VAULT_FILE_FORMAT = 'anonimizador-ip/cofre';
const MAX_FILE_BYTES = 1024 * 1024 * 1024;

/** Cofre lido de um arquivo .ipcofre, ainda não gravado. */
export interface ParsedVaultFile {
  record: VaultRecord;
  blobs: BlobRecord[];
}

interface VaultFileV1 {
  format: typeof VAULT_FILE_FORMAT;
  formatVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  payload: string;
  /** PDFs e miniaturas, cada um cifrado com o próprio IV. */
  blobs?: { id: string; iv: string; data: string }[];
}

export class InvalidVaultFileError extends Error {
  constructor(message = 'O arquivo não é um cofre válido do Anonimizador de IP.') {
    super(message);
    this.name = 'InvalidVaultFileError';
  }
}

/** O cofre do arquivo já existe neste aparelho (mesmo identificador). */
export class VaultAlreadyExistsError extends Error {
  constructor(readonly existing: VaultMeta) {
    super('Este cofre já existe neste aparelho.');
    this.name = 'VaultAlreadyExistsError';
  }
}

export async function exportVault(id: string): Promise<string> {
  const record = await getVaultRecord(id);
  const file: VaultFileV1 = {
    format: VAULT_FILE_FORMAT,
    formatVersion: 1,
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: record.kdf.iterations,
      salt: bytesToBase64(record.kdf.salt),
    },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(record.payload.iv) },
    payload: bytesToBase64(record.payload.ciphertext),
    blobs: (await listBlobRecords(id)).map((b) => ({
      id: b.blobId,
      iv: bytesToBase64(b.iv),
      data: bytesToBase64(b.ciphertext),
    })),
  };
  return JSON.stringify(file);
}

/** Nome de arquivo seguro a partir do nome do cofre (que não deve conter nomes de pessoas). */
export function vaultFileName(name: string): string {
  const base = name
    .replace(/ª/g, 'a')
    .replace(/º/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'cofre'}${VAULT_FILE_EXTENSION}`;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function decodeBase64(value: unknown, field: string): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string') throw new InvalidVaultFileError();
  try {
    return base64ToBytes(value);
  } catch {
    throw new InvalidVaultFileError(`Campo ${field} corrompido no arquivo.`);
  }
}

export function parseVaultFile(text: string): ParsedVaultFile {
  if (text.length > MAX_FILE_BYTES) throw new InvalidVaultFileError('Arquivo grande demais.');
  let data: Partial<VaultFileV1>;
  try {
    data = JSON.parse(text) as Partial<VaultFileV1>;
  } catch {
    throw new InvalidVaultFileError();
  }
  if (typeof data !== 'object' || data === null || data.format !== VAULT_FILE_FORMAT) {
    throw new InvalidVaultFileError();
  }
  if (data.formatVersion !== 1) {
    throw new InvalidVaultFileError(
      'Este cofre foi criado por uma versão mais nova do app. Atualize o app e tente de novo.',
    );
  }
  const { id, name, createdAt, updatedAt, kdf, cipher } = data;
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(id) ||
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > MAX_VAULT_NAME_LENGTH ||
    !isIsoDate(createdAt) ||
    !isIsoDate(updatedAt) ||
    kdf?.name !== 'PBKDF2' ||
    kdf.hash !== 'SHA-256' ||
    cipher?.name !== 'AES-GCM'
  ) {
    throw new InvalidVaultFileError();
  }
  if (!Number.isInteger(kdf.iterations) || kdf.iterations < PBKDF2_MIN_ITERATIONS) {
    throw new InvalidVaultFileError('O arquivo usa parâmetros de segurança abaixo do mínimo.');
  }
  const salt = decodeBase64(kdf.salt, 'salt');
  const iv = decodeBase64(cipher.iv, 'iv');
  const ciphertext = decodeBase64(data.payload, 'payload');
  if (salt.length < SALT_BYTES || iv.length !== IV_BYTES || ciphertext.length < 16) {
    throw new InvalidVaultFileError();
  }
  if (data.blobs !== undefined && !Array.isArray(data.blobs)) throw new InvalidVaultFileError();
  const blobs: BlobRecord[] = (data.blobs ?? []).map((b) => {
    if (
      typeof b !== 'object' ||
      b === null ||
      typeof b.id !== 'string' ||
      !/^[\w-]{1,64}$/.test(b.id)
    ) {
      throw new InvalidVaultFileError();
    }
    const blobIv = decodeBase64(b.iv, 'iv');
    if (blobIv.length !== IV_BYTES) throw new InvalidVaultFileError();
    return {
      key: blobKey(id, b.id),
      vaultId: id,
      blobId: b.id,
      iv: blobIv,
      ciphertext: decodeBase64(b.data, 'blob'),
    };
  });
  return {
    record: {
      id,
      name,
      createdAt,
      updatedAt,
      formatVersion: 1,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: kdf.iterations, salt },
      payload: { iv, ciphertext },
    },
    blobs,
  };
}

/**
 * Importa um cofre: confere a senha (decifrando) antes de gravar. Se o cofre já existir, só
 * substitui com `replace: true`. Um nome repetido de outro cofre recebe o sufixo "(importado)".
 */
export async function importVault(
  { record, blobs }: ParsedVaultFile,
  password: string,
  options: { replace?: boolean } = {},
): Promise<UnlockedVault> {
  const unlocked = await openRecord(record, password);
  const db = await getDb();
  const existing = await db.get('vaults', record.id);
  if (existing && !options.replace) {
    throw new VaultAlreadyExistsError({
      id: existing.id,
      name: existing.name,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    });
  }
  const all = await db.getAll('vaults');
  let name = record.name;
  const taken = (n: string) =>
    all.some(
      (v) =>
        v.id !== record.id && v.name.toLocaleLowerCase('pt-BR') === n.toLocaleLowerCase('pt-BR'),
    );
  for (let i = 1; taken(name); i++) {
    name = `${record.name.slice(0, MAX_VAULT_NAME_LENGTH - 16)} (importado${i > 1 ? ` ${i}` : ''})`;
  }
  const stored = { ...record, name };
  await putVaultRecord(stored, blobs);
  return { ...unlocked, meta: { ...unlocked.meta, name } };
}
