import {
  DecryptionError,
  PBKDF2_DEFAULT_ITERATIONS,
  decryptJson,
  deriveKey,
  encryptJson,
  generateSalt,
} from './crypto';
import { getDb } from './db';
import { emptyVaultContent, type VaultContent, type VaultMeta, type VaultRecord } from './types';

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
    return { meta: toMeta(record), key, content };
  } catch (error) {
    if (error instanceof DecryptionError) throw new WrongPasswordError();
    throw error;
  }
}

export async function unlockVault(id: string, password: string): Promise<UnlockedVault> {
  return openRecord(await getVaultRecord(id), password);
}

/** Regrava o conteúdo cifrado (IV novo a cada gravação) e atualiza a data. */
export async function saveVaultContent(
  vault: UnlockedVault,
  content: VaultContent,
): Promise<UnlockedVault> {
  const db = await getDb();
  const record = await getVaultRecord(vault.meta.id);
  const updated: VaultRecord = {
    ...record,
    updatedAt: new Date().toISOString(),
    payload: await encryptJson(vault.key, content, payloadContext(record.id)),
  };
  await db.put('vaults', updated);
  return { meta: toMeta(updated), key: vault.key, content };
}

export async function deleteVault(id: string): Promise<void> {
  await (await getDb()).delete('vaults', id);
}

export async function putVaultRecord(record: VaultRecord): Promise<void> {
  await (await getDb()).put('vaults', record);
}
