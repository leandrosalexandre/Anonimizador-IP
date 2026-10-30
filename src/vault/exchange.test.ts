// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDatabase } from './db';
import { base64ToBytes, bytesToBase64 } from './encoding';
import {
  InvalidVaultFileError,
  VaultAlreadyExistsError,
  exportVault,
  importVault,
  parseVaultFile,
  vaultFileName,
} from './exchange';
import {
  WrongPasswordError,
  createVault,
  listVaults,
  saveVaultContent,
  unlockVault,
} from './repository';
import { emptyVaultContent } from './types';

const PASSWORD = 'cavalo bateria grampo correto';

beforeEach(async () => {
  await deleteDatabase();
});

async function vaultWithContent() {
  const vault = await createVault('IP 010/2026 – 2ª DP', PASSWORD);
  const content = emptyVaultContent();
  content.config.customRoles.push('PERITO');
  return saveVaultContent(vault, content);
}

describe('exportar e importar .ipcofre', () => {
  it('leva o cofre para outro aparelho', async () => {
    const vault = await vaultWithContent();
    const file = await exportVault(vault.meta.id);
    expect(file).not.toContain('PERITO');
    const parsed = JSON.parse(file) as Record<string, unknown>;
    expect(parsed).toMatchObject({ format: 'anonimizador-ip/cofre', formatVersion: 1 });

    await deleteDatabase(); // "outro aparelho"
    const imported = await importVault(parseVaultFile(file), PASSWORD);
    expect(imported.meta).toEqual(vault.meta);
    expect(imported.content.config.customRoles).toEqual(['PERITO']);
    expect((await unlockVault(vault.meta.id, PASSWORD)).content.config.customRoles).toEqual([
      'PERITO',
    ]);
  });

  it('confere a senha antes de importar', async () => {
    const vault = await vaultWithContent();
    const file = await exportVault(vault.meta.id);
    await deleteDatabase();
    await expect(importVault(parseVaultFile(file), 'senha errada!!')).rejects.toBeInstanceOf(
      WrongPasswordError,
    );
    expect(await listVaults()).toEqual([]);
  });

  it('pede confirmação para substituir cofre existente', async () => {
    const vault = await vaultWithContent();
    const record = parseVaultFile(await exportVault(vault.meta.id));
    await expect(importVault(record, PASSWORD)).rejects.toBeInstanceOf(VaultAlreadyExistsError);
    await expect(importVault(record, PASSWORD, { replace: true })).resolves.toBeTruthy();
    expect(await listVaults()).toHaveLength(1);
  });

  it('renomeia se outro cofre já usa o mesmo nome', async () => {
    const vault = await vaultWithContent();
    const file = await exportVault(vault.meta.id);
    await deleteDatabase();
    await createVault('IP 010/2026 – 2ª DP', PASSWORD);
    const imported = await importVault(parseVaultFile(file), PASSWORD);
    expect(imported.meta.name).toBe('IP 010/2026 – 2ª DP (importado)');
  });

  it('rejeita arquivos inválidos', async () => {
    const vault = await vaultWithContent();
    const good = JSON.parse(await exportVault(vault.meta.id)) as Record<string, unknown>;
    const bad = (patch: Record<string, unknown>) => JSON.stringify({ ...good, ...patch });

    expect(() => parseVaultFile('não é json')).toThrow(InvalidVaultFileError);
    expect(() => parseVaultFile('{}')).toThrow(InvalidVaultFileError);
    expect(() => parseVaultFile(bad({ formatVersion: 2 }))).toThrow('versão mais nova');
    expect(() =>
      parseVaultFile(bad({ kdf: { ...(good.kdf as object), iterations: 1000 } })),
    ).toThrow('abaixo do mínimo');
    expect(() => parseVaultFile(bad({ payload: '%%%' }))).toThrow(InvalidVaultFileError);
    expect(() => parseVaultFile(bad({ id: '../x' }))).toThrow(InvalidVaultFileError);
  });

  it('detecta payload adulterado como senha/arquivo inválido', async () => {
    const vault = await vaultWithContent();
    const good = JSON.parse(await exportVault(vault.meta.id)) as { payload: string };
    const bytes = base64ToBytes(good.payload);
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    const record = parseVaultFile(JSON.stringify({ ...good, payload: bytesToBase64(bytes) }));
    await expect(importVault(record, PASSWORD, { replace: true })).rejects.toBeInstanceOf(
      WrongPasswordError,
    );
  });

  it('gera nome de arquivo seguro', () => {
    expect(vaultFileName('IP 123/2026 – 24ª DP')).toBe('IP-123-2026-24a-DP.ipcofre');
    expect(vaultFileName('///')).toBe('cofre.ipcofre');
  });
});
