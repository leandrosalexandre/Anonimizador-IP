// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDatabase, getDb } from './db';
import {
  VaultNameError,
  WrongPasswordError,
  createVault,
  deleteVault,
  listVaults,
  saveVaultContent,
  unlockVault,
} from './repository';
import { emptyVaultContent } from './types';

const PASSWORD = 'cavalo bateria grampo correto';
const MARKER = 'MARCADOR-FICTICIO-ZYXWV';

beforeEach(async () => {
  await deleteDatabase();
});

describe('repositório de cofres', () => {
  it('cria, lista e abre um cofre', async () => {
    const created = await createVault('  IP 001/2026 –  1ª DP ', PASSWORD);
    expect(created.meta.name).toBe('IP 001/2026 – 1ª DP');
    expect(await listVaults()).toEqual([created.meta]);
    const opened = await unlockVault(created.meta.id, PASSWORD);
    expect(opened.content).toEqual(emptyVaultContent());
  });

  it('senha errada gera WrongPasswordError', async () => {
    const { meta } = await createVault('IP 002/2026', PASSWORD);
    await expect(unlockVault(meta.id, 'outra senha qualquer')).rejects.toBeInstanceOf(
      WrongPasswordError,
    );
  });

  it('grava o conteúdo apenas cifrado, sem senha nem chave', async () => {
    const vault = await createVault('IP 003/2026', PASSWORD);
    const content = emptyVaultContent();
    content.config.keepNames.push(MARKER);
    await saveVaultContent(vault, content);

    const raw = await (await getDb()).get('vaults', vault.meta.id);
    const serialized = JSON.stringify(raw, (_k, v: unknown) =>
      v instanceof Uint8Array ? String.fromCharCode(...v) : v,
    );
    expect(serialized).not.toContain(MARKER);
    expect(serialized).not.toContain(PASSWORD);
    expect(Object.keys(raw ?? {}).sort()).toEqual(
      ['createdAt', 'formatVersion', 'id', 'kdf', 'name', 'payload', 'updatedAt'].sort(),
    );
    expect(raw?.kdf.iterations).toBeGreaterThanOrEqual(600_000);
    expect(raw?.kdf.salt).toHaveLength(16);

    const reopened = await unlockVault(vault.meta.id, PASSWORD);
    expect(reopened.content.config.keepNames).toEqual([MARKER]);
  });

  it('usa salt diferente por cofre e IV novo a cada gravação', async () => {
    const a = await createVault('IP A', PASSWORD);
    const b = await createVault('IP B', PASSWORD);
    const db = await getDb();
    const ra = await db.get('vaults', a.meta.id);
    const rb = await db.get('vaults', b.meta.id);
    expect(ra?.kdf.salt).not.toEqual(rb?.kdf.salt);
    await saveVaultContent(a, emptyVaultContent());
    const ra2 = await db.get('vaults', a.meta.id);
    expect(ra2?.payload.iv).not.toEqual(ra?.payload.iv);
  });

  it('valida o nome', async () => {
    await expect(createVault('   ', PASSWORD)).rejects.toBeInstanceOf(VaultNameError);
    await expect(createVault('x'.repeat(81), PASSWORD)).rejects.toBeInstanceOf(VaultNameError);
    await createVault('IP 004/2026', PASSWORD);
    await expect(createVault('ip 004/2026', PASSWORD)).rejects.toThrow('Já existe');
  });

  it('apaga um cofre', async () => {
    const { meta } = await createVault('IP 005/2026', PASSWORD);
    await deleteVault(meta.id);
    expect(await listVaults()).toEqual([]);
  });
});
