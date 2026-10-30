import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { trackForeignRequests } from './helpers';

const PASSWORD = 'girassol tapete nuvem bicicleta';
const NAME = 'IP 900/2026 – DP Fictícia';

async function createVault(page: Page, name = NAME, password = PASSWORD) {
  await page.goto('./#/cofres');
  await page.getByRole('button', { name: 'Novo cofre' }).click();
  await page.getByLabel('Nome do cofre').fill(name);
  await page.getByLabel('Senha do cofre', { exact: true }).fill(password);
  await page.getByLabel('Confirme a senha').fill(password);
  await page.getByRole('button', { name: 'Criar cofre' }).click();
  await expect(page.getByRole('banner')).toContainText(`Cofre aberto: ${name}`);
}

async function openVault(page: Page, name: string, password: string) {
  const card = page.getByRole('listitem').filter({ hasText: name });
  const field = card.getByLabel(`Senha do cofre “${name}”`);
  if (!(await field.isVisible())) await card.getByRole('button', { name: 'Abrir' }).click();
  await field.fill(password);
  await card.getByRole('button', { name: 'Abrir', exact: true }).click();
}

test('cria, bloqueia e reabre o cofre; senha errada mostra erro', async ({ page, baseURL }) => {
  const foreign = trackForeignRequests(page, new URL(baseURL ?? '').origin);
  await createVault(page);

  await page.getByRole('banner').getByRole('button', { name: 'Bloquear' }).click();
  await expect(page.getByRole('banner')).toContainText('Nenhum cofre aberto');

  await openVault(page, NAME, 'senha errada qualquer');
  await expect(page.getByRole('alert')).toHaveText('Senha incorreta.');
  // O app continua respondendo.
  await page.getByRole('link', { name: 'Configurações' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Configurações');
  await page.getByRole('link', { name: 'Cofres' }).click();

  await openVault(page, NAME, 'outra senha errada');
  await expect(page.getByRole('alert')).toHaveText('Senha incorreta.');
  await openVault(page, NAME, PASSWORD);
  await expect(page.getByRole('banner')).toContainText(`Cofre aberto: ${NAME}`);
  expect(foreign).toEqual([]);
});

test('impede senha fraca e senhas diferentes', async ({ page }) => {
  await page.goto('./#/cofres');
  await page.getByRole('button', { name: 'Novo cofre' }).click();
  await page.getByLabel('Nome do cofre').fill('IP 901/2026');
  await page.getByLabel('Senha do cofre', { exact: true }).fill('senha123');
  await expect(page.getByText('Força da senha: Muito fraca')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar cofre' })).toBeDisabled();
  await page.getByLabel('Senha do cofre', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirme a senha').fill(PASSWORD + 'x');
  await expect(page.getByText('As senhas não conferem.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar cofre' })).toBeDisabled();
});

test('no IndexedDB só há metadados em claro e conteúdo cifrado', async ({ page }) => {
  await createVault(page);
  const raw = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('anonimizador-ip');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const records = await new Promise<Record<string, unknown>[]>((resolve) => {
      const req = db.transaction('vaults').objectStore('vaults').getAll();
      req.onsuccess = () => resolve(req.result as Record<string, unknown>[]);
    });
    db.close();
    const r = records[0] as {
      payload: { iv: Uint8Array; ciphertext: Uint8Array };
      kdf: { iterations: number };
    };
    return {
      count: records.length,
      keys: Object.keys(records[0] ?? {}).sort(),
      ivLength: r.payload.iv.length,
      cipherIsBinary: r.payload.ciphertext instanceof Uint8Array,
      iterations: r.kdf.iterations,
      dump: JSON.stringify(records, (_k, v: unknown) =>
        v instanceof Uint8Array ? String.fromCharCode(...v) : v,
      ),
      localStorage: JSON.stringify(localStorage),
    };
  });
  expect(raw.count).toBe(1);
  expect(raw.keys).toEqual(
    ['createdAt', 'formatVersion', 'id', 'kdf', 'name', 'payload', 'updatedAt'].sort(),
  );
  expect(raw.ivLength).toBe(12);
  expect(raw.cipherIsBinary).toBe(true);
  expect(raw.iterations).toBeGreaterThanOrEqual(600_000);
  expect(raw.dump).not.toContain(PASSWORD);
  expect(raw.dump).not.toContain('keepNames');
  expect(raw.localStorage).not.toContain(PASSWORD);
});

test('exporta e importa o cofre entre dois perfis de navegador', async ({ page, browser }) => {
  await createVault(page);
  const card = page.getByRole('listitem').filter({ hasText: NAME });
  const downloadPromise = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Exportar' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('IP-900-2026-DP-Ficticia.ipcofre');
  const filePath = await download.path();
  const fileText = await readFile(filePath, 'utf8');
  expect(fileText).not.toContain(PASSWORD);

  const other = await browser.newContext();
  const page2 = await other.newPage();
  await page2.goto('./#/cofres');
  await expect(page2.getByText('Nenhum cofre neste aparelho.')).toBeVisible();
  await page2.getByLabel('Importar cofre (.ipcofre)').setInputFiles(filePath);
  await page2.getByLabel(`Senha do cofre “${NAME}”`).fill('senha errada qualquer');
  await page2.getByRole('button', { name: 'Importar', exact: true }).click();
  await expect(page2.getByRole('alert')).toHaveText('Senha incorreta.');
  await page2.getByLabel(`Senha do cofre “${NAME}”`).fill(PASSWORD);
  await page2.getByRole('button', { name: 'Importar', exact: true }).click();
  await expect(page2.getByRole('banner')).toContainText(`Cofre aberto: ${NAME}`);
  await expect(page2.getByRole('listitem').filter({ hasText: NAME })).toBeVisible();

  // Importar de novo no mesmo perfil pede confirmação para substituir.
  await page2.getByLabel('Importar cofre (.ipcofre)').setInputFiles(filePath);
  await page2.getByLabel(`Senha do cofre “${NAME}”`).fill(PASSWORD);
  await page2.getByRole('button', { name: 'Importar', exact: true }).click();
  await expect(page2.getByText('Este aparelho já tem o cofre')).toBeVisible();
  await page2.getByRole('button', { name: 'Substituir' }).click();
  await expect(
    page2.getByRole('list', { name: 'Cofres neste aparelho' }).getByRole('listitem'),
  ).toHaveCount(1);
  await other.close();
});

test('arquivo inválido mostra erro claro', async ({ page }) => {
  await page.goto('./#/cofres');
  await page.getByLabel('Importar cofre (.ipcofre)').setInputFiles({
    name: 'qualquer.ipcofre',
    mimeType: 'application/json',
    buffer: Buffer.from('{"nada": true}'),
  });
  await expect(page.getByRole('alert')).toHaveText(
    'O arquivo não é um cofre válido do Anonimizador de IP.',
  );
});

test('apaga o cofre só após digitar o nome', async ({ page }) => {
  await createVault(page);
  const card = page.getByRole('listitem').filter({ hasText: NAME });
  await card.getByRole('button', { name: 'Apagar' }).click();
  const confirm = card.getByRole('button', { name: 'Apagar cofre' });
  await expect(confirm).toBeDisabled();
  await card.getByLabel(/Digite .* para confirmar/).fill('IP 900');
  await expect(confirm).toBeDisabled();
  await card.getByLabel(/Digite .* para confirmar/).fill(NAME);
  await confirm.click();
  await expect(page.getByText('Nenhum cofre neste aparelho.')).toBeVisible();
  await expect(page.getByRole('banner')).toContainText('Nenhum cofre aberto');
});

test('apagar tudo remove todos os cofres', async ({ page }) => {
  await createVault(page, 'IP A');
  await page.getByRole('banner').getByRole('button', { name: 'Bloquear' }).click();
  await createVault(page, 'IP B');
  await page.getByRole('link', { name: 'Configurações' }).click();
  await page.getByRole('button', { name: 'Apagar tudo…' }).click();
  await page.getByLabel(/Digite .* para confirmar/).fill('APAGAR TUDO');
  await page.getByRole('button', { name: 'Apagar tudo', exact: true }).click();
  await expect(page.getByText('Todos os cofres e preferências foram apagados')).toBeVisible();
  await page.getByRole('link', { name: 'Cofres' }).click();
  await expect(page.getByText('Nenhum cofre neste aparelho.')).toBeVisible();
});

test('bloqueia por inatividade', async ({ page }) => {
  await page.clock.install();
  await createVault(page);
  await page.clock.fastForward('09:00');
  await expect(page.getByRole('banner')).toContainText(`Cofre aberto: ${NAME}`);
  await page.clock.fastForward('01:10');
  await expect(page.getByRole('banner')).toContainText('Nenhum cofre aberto');
  await expect(page.getByText('O cofre foi bloqueado por inatividade.')).toBeVisible();
});

test('bloqueia ao ocultar o app', async ({ page }) => {
  await createVault(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('banner')).toContainText('Nenhum cofre aberto');
  await expect(page.getByText('O cofre foi bloqueado porque o app saiu da tela.')).toBeVisible();
});

test('telas do inquérito exigem cofre aberto', async ({ page }) => {
  await page.goto('./#/documentos');
  await expect(page.getByText('Abra um cofre para continuar.')).toBeVisible();
});
