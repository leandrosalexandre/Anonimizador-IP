// Criptografia do cofre (SPEC 2.4): AES-GCM 256 com chave derivada por PBKDF2-SHA-256.
// Somente WebCrypto nativa. A chave é não exportável e nunca é gravada.
import { randomBytes, utf8Decode, utf8Encode } from './encoding';

export const PBKDF2_MIN_ITERATIONS = 600_000;
export const PBKDF2_DEFAULT_ITERATIONS = 600_000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;

export interface EncryptedData {
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: Uint8Array<ArrayBuffer>;
}

/** Senha errada ou dados adulterados: o AES-GCM não consegue autenticar o conteúdo. */
export class DecryptionError extends Error {
  constructor() {
    super('Não foi possível decifrar os dados.');
    this.name = 'DecryptionError';
  }
}

export function generateSalt(): Uint8Array<ArrayBuffer> {
  return randomBytes(SALT_BYTES);
}

export async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number = PBKDF2_DEFAULT_ITERATIONS,
): Promise<CryptoKey> {
  if (!Number.isInteger(iterations) || iterations < PBKDF2_MIN_ITERATIONS) {
    throw new RangeError(`PBKDF2 exige no mínimo ${PBKDF2_MIN_ITERATIONS} iterações.`);
  }
  if (salt.length < SALT_BYTES) throw new RangeError('Salt muito curto.');
  const baseKey = await crypto.subtle.importKey('raw', utf8Encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Cifra com IV aleatório de 12 bytes a cada chamada. `context` é autenticado (AAD) mas não
 * cifrado: amarra o conteúdo ao cofre, impedindo trocar o payload de um cofre por outro.
 */
export async function encrypt(
  key: CryptoKey,
  plaintext: Uint8Array<ArrayBuffer>,
  context: string,
): Promise<EncryptedData> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8Encode(context) },
    key,
    plaintext,
  );
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

export async function decrypt(
  key: CryptoKey,
  data: EncryptedData,
  context: string,
): Promise<Uint8Array<ArrayBuffer>> {
  if (data.iv.length !== IV_BYTES) throw new DecryptionError();
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: data.iv, additionalData: utf8Encode(context) },
      key,
      data.ciphertext,
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new DecryptionError();
  }
}

export async function encryptJson(
  key: CryptoKey,
  value: unknown,
  context: string,
): Promise<EncryptedData> {
  return encrypt(key, utf8Encode(JSON.stringify(value)), context);
}

export async function decryptJson<T>(
  key: CryptoKey,
  data: EncryptedData,
  context: string,
): Promise<T> {
  const bytes = await decrypt(key, data, context);
  return JSON.parse(utf8Decode(bytes)) as T;
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}
