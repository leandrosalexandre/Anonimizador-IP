import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { trackForeignRequests, waitForServiceWorker } from './helpers';

const PASSWORD = 'girassol tapete nuvem bicicleta';
const FIXTURES = new URL('../test/fixtures/', import.meta.url);
const gabarito = JSON.parse(readFileSync(new URL('gabarito.json', FIXTURES), 'utf8')) as {
  pages: { pdfPage: number; folha: number; text: string }[];
  files: { text: string; scanned: string; mixed: { file: string; imagePages: number[] } };
};
const fixture = (name: string) => new URL(name, FIXTURES).pathname;

async function createVaultAndGoToDocuments(page: Page) {
  await page.goto('./#/cofres');
  await page.getByRole('button', { name: 'Novo cofre' }).click();
  await page.getByLabel('Nome do cofre').fill('IP 900/2026 – DP Fictícia');
  await page.getByLabel('Senha do cofre', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirme a senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar cofre' }).click();
  await expect(page.getByRole('banner')).toContainText('Cofre aberto');
  await page.getByRole('link', { name: 'Documentos' }).first().click();
}

async function importFixture(page: Page, file: string) {
  await page.getByLabel('Selecionar PDFs').setInputFiles(fixture(file));
  await expect(page.getByText(`${file}:`)).toBeVisible({ timeout: 60_000 });
}

const pageRow = (page: Page, n: number) =>
  page.getByRole('listitem', { name: `Página ${n} do PDF`, exact: true });

test('importa o PDF misto: classifica páginas, detecta folhas e mostra o texto', async ({
  page,
  baseURL,
}) => {
  const foreign = trackForeignRequests(page, new URL(baseURL ?? '').origin);
  await createVaultAndGoToDocuments(page);
  await importFixture(page, gabarito.files.mixed.file);
  await expect(
    page.getByText('15 páginas importadas (4 sem texto, precisam de OCR).'),
  ).toBeVisible();

  const doc = page.getByRole('article', { name: gabarito.files.mixed.file });
  await expect(
    doc.getByText('15 páginas · fls. 3 a 17 · 11 com texto · 4 sem texto'),
  ).toBeVisible();

  for (const expected of gabarito.pages) {
    const row = pageRow(page, expected.pdfPage);
    await expect(row.locator('.page-folha')).toHaveText(`fls. ${expected.folha}`);
    const isImage = gabarito.files.mixed.imagePages.includes(expected.pdfPage);
    await expect(row.locator('.kind-badge')).toHaveText(isImage ? 'Imagem' : 'Texto');
  }
  await expect(pageRow(page, 3).getByText('Folha estimada')).toBeVisible();
  await expect(pageRow(page, 4).getByText('Folha detectada')).toHaveCount(0);

  // Texto extraído da p. 2 (BO).
  await pageRow(page, 2).getByRole('button', { name: 'Ver texto' }).click();
  const text = await pageRow(page, 2).getByLabel('Texto da página 2').textContent();
  const words = (s: string) => s.split(/\s+/).filter(Boolean);
  expect(words(text ?? '')).toEqual(words(gabarito.pages[1]?.text ?? ''));

  // Página escaneada: sem texto.
  await pageRow(page, 3).getByRole('button', { name: 'Ver texto' }).click();
  await expect(pageRow(page, 3).getByText('Página sem texto (imagem escaneada)')).toBeVisible();

  // Miniaturas decifradas e exibidas.
  await expect(pageRow(page, 1).locator('img')).toBeVisible();

  expect(foreign).toEqual([]);
});

test('PDF escaneado: todas as páginas como imagem', async ({ page }) => {
  await createVaultAndGoToDocuments(page);
  await importFixture(page, gabarito.files.scanned);
  await expect(
    page.getByText('15 páginas importadas (15 sem texto, precisam de OCR).'),
  ).toBeVisible();
  await expect(page.locator('.kind-badge', { hasText: 'Imagem' })).toHaveCount(15);
  await expect(page.locator('.page-folha', { hasText: 'fls. ?' })).toHaveCount(15);
});

test('ajuste de folhas por deslocamento e correção manual; persiste após bloquear', async ({
  page,
}) => {
  await createVaultAndGoToDocuments(page);
  await importFixture(page, gabarito.files.scanned);

  await page.getByLabel('A página 1 do PDF corresponde à fls.').fill('3');
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(pageRow(page, 15).locator('.page-folha')).toHaveText('fls. 17');
  await expect(pageRow(page, 15).getByText('Folha pelo deslocamento')).toBeVisible();

  await pageRow(page, 5).getByRole('button', { name: 'Corrigir fls.' }).click();
  await pageRow(page, 5).getByLabel('Folha desta página').fill('70');
  await pageRow(page, 5).getByRole('button', { name: 'Salvar' }).click();
  await expect(pageRow(page, 5).locator('.page-folha')).toHaveText('fls. 70');

  // Bloqueia e reabre: tudo continua lá (gravado cifrado).
  await page.getByRole('banner').getByRole('button', { name: 'Bloquear' }).click();
  await page.getByRole('link', { name: 'Cofres', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  await page.getByLabel(/Senha do cofre/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  await page.getByRole('link', { name: 'Ir para Documentos' }).click();
  await expect(pageRow(page, 5).locator('.page-folha')).toHaveText('fls. 70');
  await expect(pageRow(page, 6).locator('.page-folha')).toHaveText('fls. 8');
});

test('recusa arquivo que não é PDF e PDF repetido', async ({ page }) => {
  await createVaultAndGoToDocuments(page);
  await page.getByLabel('Selecionar PDFs').setInputFiles({
    name: 'nota.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('isto não é um pdf'),
  });
  await expect(page.getByText('nota.pdf: O arquivo não é um PDF.')).toBeVisible();

  await importFixture(page, gabarito.files.text);
  await page.getByLabel('Selecionar PDFs').setInputFiles(fixture(gabarito.files.text));
  await expect(page.getByText('Este PDF já foi importado neste cofre')).toBeVisible({
    timeout: 30_000,
  });
});

test('remove documento do cofre', async ({ page }) => {
  await createVaultAndGoToDocuments(page);
  await importFixture(page, gabarito.files.text);
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  await page.getByRole('button', { name: 'Remover documento' }).click();
  await expect(page.getByText('Nenhum documento neste cofre.')).toBeVisible();
  const blobs = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('anonimizador-ip');
      req.onsuccess = () => resolve(req.result);
    });
    const count = await new Promise<number>((resolve) => {
      const req = db.transaction('blobs').objectStore('blobs').count();
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return count;
  });
  expect(blobs).toBe(0);
});

test('importa PDF sem internet', async ({ page, context }) => {
  await page.goto('./');
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await createVaultAndGoToDocuments(page);
  await importFixture(page, gabarito.files.mixed.file);
  await expect(page.getByText('15 páginas importadas')).toBeVisible();
  await expect(pageRow(page, 1).locator('img')).toBeVisible();
});

test('o seletor de arquivos não bloqueia o cofre, mesmo com bloqueio imediato', async ({
  page,
}) => {
  await createVaultAndGoToDocuments(page);
  await page.getByRole('link', { name: 'Configurações' }).click();
  await page.getByLabel('Ao ocultar o app').selectOption('immediate');
  await page.getByRole('link', { name: 'Documentos' }).first().click();

  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Selecionar PDFs').click();
  // No Android, o seletor cobre o app: a página fica oculta enquanto o usuário escolhe.
  const setVisibility = (value: DocumentVisibilityState) =>
    page.evaluate((v) => {
      Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, value);
  await setVisibility('hidden');
  await (await chooser).setFiles(fixture(gabarito.files.text));
  await setVisibility('visible');

  await expect(page.getByText(`${gabarito.files.text}:`)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('banner')).toContainText('Cofre aberto');
  await expect(page.getByRole('article', { name: gabarito.files.text })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Etapas' }).locator('.nav-count')).toHaveText(
    '1',
  );
});
