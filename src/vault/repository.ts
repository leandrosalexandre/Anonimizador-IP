import { migrateContent } from './migrate';
import {
  DecryptionError,
  PBKDF2_DEFAULT_ITERATIONS,
  decrypt,
  decryptJson,
  deriveKey,
  encrypt,
  encryptJson,
  generateSalt,
} from './crypto';
import { getDb } from './db';
import {
  emptyVaultContent,
  type BlobRecord,
  type VaultContent,
  type VaultMeta,
  type VaultRecord,
} from './types';

export const MAX_VAULT_NAME_LENGTH = 80;

/** Cofre aberto: só existe em memória e é descartado ao bloquear. */
export interface UnlockedVault {
  meta: VaultMeta;
  key: CryptoKey;
  content: VaultContent;
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Senha incorreta.');
    this.name = 'WrongPasswordError';
  }
}

export class VaultNotFoundError extends Error {
  constructor() {
    super('Cofre não encontrado.');
    this.name = 'VaultNotFoundError';
  }
}

export class VaultNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultNameError';
  }
}

/** Dado autenticado (AAD) que amarra o conteúdo cifrado ao identificador do cofre. */
export function payloadContext(vaultId: string): string {
  return `anonimizador-ip:cofre:v1:${vaultId}`;
}

/** AAD dos arquivos binários: amarra cada blob ao cofre e ao seu identificador. */
export function blobContext(vaultId: string, blobId: string): string {
  return `anonimizador-ip:blob:v1:${vaultId}:${blobId}`;
}

export function blobKey(vaultId: string, blobId: string): string {
  return `${vaultId}/${blobId}`;
}

export function toMeta(record: VaultRecord): VaultMeta {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function normalizeVaultName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export async function listVaults(): Promise<VaultMeta[]> {
  const db = await getDb();
  const records = await db.getAll('vaults');
  return records.map(toMeta).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getVaultRecord(id: string): Promise<VaultRecord> {
  const record = await (await getDb()).get('vaults', id);
  if (!record) throw new VaultNotFoundError();
  return record;
}

export async function assertNameAvailable(name: string, exceptId?: string): Promise<void> {
  const existing = await listVaults();
  const lower = name.toLocaleLowerCase('pt-BR');
  if (existing.some((v) => v.id !== exceptId && v.name.toLocaleLowerCase('pt-BR') === lower)) {
    throw new VaultNameError('Já existe um cofre com esse nome.');
  }
}

export async function createVault(rawName: string, password: string): Promise<UnlockedVault> {
  const name = normalizeVaultName(rawName);
  if (!name) throw new VaultNameError('Informe um nome para o cofre.');
  if (name.length > MAX_VAULT_NAME_LENGTH) {
    throw new VaultNameError(`O nome deve ter no máximo ${MAX_VAULT_NAME_LENGTH} caracteres.`);
  }
  await assertNameAvailable(name);

  const id = crypto.randomUUID();
  const salt = generateSalt();
  const iterations = PBKDF2_DEFAULT_ITERATIONS;
  const key = await deriveKey(password, salt, iterations);
  const content = emptyVaultContent();
  const now = new Date().toISOString();
  const record: VaultRecord = {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    formatVersion: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt },
    payload: await encryptJson(key, content, payloadContext(id)),
  };
  await (await getDb()).add('vaults', record);
  return { meta: toMeta(record), key, content };
}

/** Deriva a chave e decifra o conteúdo; senha errada gera WrongPasswordError. */
export async function openRecord(record: VaultRecord, password: string): Promise<UnlockedVault> {
  const key = await deriveKey(password, record.kdf.salt, record.kdf.iterations);
  try {
    const content = await decryptJson<VaultContent>(key, record.payload, payloadContext(record.id));
    return { meta: toMeta(record), key, content: migrateContent(content) };
  } catch (error) {
    if (error instanceof DecryptionError) throw new WrongPasswordError();
    throw error;
  }
}

export async function unlockVault(id: string, password: string): Promise<UnlockedVault> {
  return openRecord(await getVaultRecord(id), password);
}

export interface ContentChanges {
  /** Arquivos binários novos (cifrados antes de gravar). */
  putBlobs?: { id: string; bytes: Uint8Array<ArrayBuffer> }[];
  deleteBlobIds?: string[];
}

/**
 * Regrava o conteúdo cifrado (IV novo a cada gravação) e atualiza a data. Blobs novos e
 * removidos entram na mesma transação, para o cofre nunca ficar inconsistente.
 */
export async function saveVaultContent(
  vault: UnlockedVault,
  content: VaultContent,
  changes: ContentChanges = {},
): Promise<UnlockedVault> {
  const id = vault.meta.id;
  const record = await getVaultRecord(id);
  const payload = await encryptJson(vault.key, content, payloadContext(id));
  const blobs: BlobRecord[] = [];
  for (const blob of changes.putBlobs ?? []) {
    const enc = await encrypt(vault.key, blob.bytes, blobContext(id, blob.id));
    blobs.push({ key: blobKey(id, blob.id), vaultId: id, blobId: blob.id, ...enc });
  }
  const updated: VaultRecord = { ...record, updatedAt: new Date().toISOString(), payload };

  const db = await getDb();
  const tx = db.transaction(['vaults', 'blobs'], 'readwrite');
  const blobStore = tx.objectStore('blobs');
  await Promise.all([
    tx.objectStore('vaults').put(updated),
    ...blobs.map((b) => blobStore.put(b)),
    ...(changes.deleteBlobIds ?? []).map((b) => blobStore.delete(blobKey(id, b))),
    tx.done,
  ]);
  return { meta: toMeta(updated), key: vault.key, content };
}

export async function readBlob(
  vault: UnlockedVault,
  blobId: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const record = await (await getDb()).get('blobs', blobKey(vault.meta.id, blobId));
  if (!record) throw new VaultNotFoundError();
  return decrypt(vault.key, record, blobContext(vault.meta.id, blobId));
}

export async function listBlobRecords(vaultId: string): Promise<BlobRecord[]> {
  return (await getDb()).getAllFromIndex('blobs', 'byVault', vaultId);
}

export async function deleteVault(id: string): Promise<void> {
  const db = await getDb();
  const keys = await db.getAllKeysFromIndex('blobs', 'byVault', id);
  const tx = db.transaction(['vaults', 'blobs'], 'readwrite');
  await Promise.all([
    tx.objectStore('vaults').delete(id),
    ...keys.map((k) => tx.objectStore('blobs').delete(k)),
    tx.done,
  ]);
}

/** Grava um cofre importado, substituindo todos os seus blobs. */
export async function putVaultRecord(record: VaultRecord, blobs: BlobRecord[] = []): Promise<void> {
  const db = await getDb();
  const oldKeys = await db.getAllKeysFromIndex('blobs', 'byVault', record.id);
  const tx = db.transaction(['vaults', 'blobs'], 'readwrite');
  const blobStore = tx.objectStore('blobs');
  await Promise.all([
    ...oldKeys.map((k) => blobStore.delete(k)),
    tx.objectStore('vaults').put(record),
    ...blobs.map((b) => blobStore.put(b)),
    tx.done,
  ]);
}
