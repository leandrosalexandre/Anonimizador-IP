// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DecryptionError,
  PBKDF2_MIN_ITERATIONS,
  decrypt,
  decryptJson,
  deriveKey,
  encrypt,
  encryptJson,
  generateSalt,
  sha256Hex,
} from './crypto';
import { utf8Decode, utf8Encode } from './encoding';

const CONTEXT = 'anonimizador-ip:cofre:v1:teste';

describe('crypto', () => {
  it('cifra e decifra (ida e volta)', async () => {
    const salt = generateSalt();
    const key = await deriveKey('frase de teste bem comprida', salt);
    const data = await encrypt(key, utf8Encode('Conteúdo fictício — çãé'), CONTEXT);
    expect(data.iv).toHaveLength(12);
    const again = await deriveKey('frase de teste bem comprida', salt);
    expect(utf8Decode(await decrypt(again, data, CONTEXT))).toBe('Conteúdo fictício — çãé');
  });

  it('rejeita senha errada com DecryptionError', async () => {
    const salt = generateSalt();
    const key = await deriveKey('senha correta 123', salt);
    const data = await encryptJson(key, { a: 1 }, CONTEXT);
    const wrong = await deriveKey('senha errada 123', salt);
    await expect(decryptJson(wrong, data, CONTEXT)).rejects.toBeInstanceOf(DecryptionError);
  });

  it('detecta dados adulterados', async () => {
    const key = await deriveKey('frase de teste bem comprida', generateSalt());
    const data = await encrypt(key, utf8Encode('abc'), CONTEXT);
    const tampered = new Uint8Array(data.ciphertext);
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    await expect(decrypt(key, { iv: data.iv, ciphertext: tampered }, CONTEXT)).rejects.toThrow(
      DecryptionError,
    );
  });

  it('amarra o conteúdo ao contexto (outro cofre não decifra)', async () => {
    const key = await deriveKey('frase de teste bem comprida', generateSalt());
    const data = await encrypt(key, utf8Encode('abc'), CONTEXT);
    await expect(decrypt(key, data, 'anonimizador-ip:cofre:v1:outro')).rejects.toThrow(
      DecryptionError,
    );
  });

  it('usa IV novo a cada gravação', async () => {
    const key = await deriveKey('frase de teste bem comprida', generateSalt());
    const a = await encrypt(key, utf8Encode('mesmo texto'), CONTEXT);
    const b = await encrypt(key, utf8Encode('mesmo texto'), CONTEXT);
    expect(a.iv).not.toEqual(b.iv);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  it('gera chave AES-GCM 256 não exportável', async () => {
    const key = await deriveKey('frase de teste bem comprida', generateSalt());
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('exige no mínimo 600.000 iterações e salt de 16 bytes', async () => {
    expect(PBKDF2_MIN_ITERATIONS).toBe(600_000);
    await expect(deriveKey('x', generateSalt(), 100_000)).rejects.toThrow(RangeError);
    await expect(deriveKey('x', new Uint8Array(8))).rejects.toThrow(RangeError);
  });

  it('calcula SHA-256', async () => {
    expect(await sha256Hex(utf8Encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
