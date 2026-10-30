import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { trackForeignRequests, waitForServiceWorker } from './helpers';

const PASSWORD = 'girassol tapete nuvem bicicleta';
const FIXTURES = new URL('../test/fixtures/', import.meta.url);
const gabarito = JSON.parse(readFileSync(new URL('gabarito.json', FIXTURES), 'utf8')) as {
  pages: { pdfPage: number; folha: number; text: string }[];
  files: { scanned: string; mixed: { file: string; imagePages: number[] } };
};

// OCR é lento: roda só no projeto desktop (ver playwright.config.ts) e com tempo maior.
test.describe.configure({ timeout: 240_000 });

async function setup(page: Page, file: string) {
  await page.goto('./#/cofres');
  await page.getByRole('button', { name: 'Novo cofre' }).click();
  await page.getByLabel('Nome do cofre').fill('IP 900/2026 – OCR');
  await page.getByLabel('Senha do cofre', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirme a senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar cofre' }).click();
  await page.getByRole('link', { name: 'Ir para Documentos' }).click();
  await page.getByLabel('Selecionar PDFs').setInputFiles(new URL(file, FIXTURES).pathname);
  await expect(page.getByText(`${file}:`)).toBeVisible({ timeout: 60_000 });
}

const pageRow = (page: Page, n: number) =>
  page.getByRole('listitem', { name: `Página ${n} do PDF`, exact: true });

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

test('OCR das páginas escaneadas do PDF misto, sem internet', async ({
  page,
  context,
  baseURL,
}) => {
  const foreign = trackForeignRequests(page, new URL(baseURL ?? '').origin);
  await page.goto('./');
  await waitForServiceWorker(page);
  await context.setOffline(true);

  await setup(page, gabarito.files.mixed.file);
  await page.getByRole('button', { name: 'Fazer OCR das páginas sem texto (4)' }).click();
  await expect(page.getByRole('heading', { name: 'OCR concluído' })).toBeVisible({
    timeout: 200_000,
  });
  const summary = await page.locator('.ocr-panel').textContent();
  console.log('Resumo do OCR:', summary);

  for (const n of gabarito.files.mixed.imagePages) {
    const row = pageRow(page, n);
    await expect(row.locator('.kind-badge').first()).toHaveText('OCR feito');
    const expected = gabarito.pages[n - 1];
    // Folha detectada pelo OCR no carimbo (não apenas estimada pelas vizinhas).
    await expect(row.locator('.page-folha')).toHaveText(`fls. ${expected?.folha}`);
    await expect(row.getByText('Folha detectada')).toBeVisible();
  }

  // Conteúdo reconhecido: nomes e números da p. 3 (declarações da vítima).
  await pageRow(page, 3).getByRole('button', { name: 'Ver texto' }).click();
  const text = normalize(
    (await pageRow(page, 3).getByLabel('Texto da página 3').textContent()) ?? '',
  );
  for (const needle of ['maria da conceicao silva souza', '52998224725', 'hxp4821', 'chico bala']) {
    expect(text).toContain(needle);
  }
  expect(foreign).toEqual([]);
});

test('tela de conferência: imagem, destaque e correção do texto', async ({ page }) => {
  await setup(page, gabarito.files.scanned);
  await pageRow(page, 1).getByRole('button', { name: 'Fazer OCR' }).click();
  await expect(page.getByRole('heading', { name: 'OCR concluído' })).toBeVisible({
    timeout: 120_000,
  });
  await pageRow(page, 1).getByRole('link', { name: 'Conferir' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Conferência – fls. 3 (PDF p. 1)',
  );
  await expect(page.getByAltText('Imagem da página 1 do PDF')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Confiança média do OCR')).toBeVisible();

  await page.getByRole('button', { name: 'Aumentar zoom' }).click();
  await expect(page.getByRole('button', { name: 'Ajustar à largura' })).toHaveText('125%');

  await page.getByRole('button', { name: 'Corrigir texto' }).click();
  const editor = page.getByLabel('Texto da página (as correções substituem o texto)');
  await editor.fill('PORTARIA corrigida pelo usuário');
  await page.getByRole('button', { name: 'Salvar correções' }).click();
  await expect(page.getByText('Correções salvas.')).toBeVisible();
  await expect(page.getByLabel('Texto da página 1')).toHaveText('PORTARIA corrigida pelo usuário');

  await page.getByRole('button', { name: 'Próxima ›' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('(PDF p. 2)');
  await expect(page.getByRole('button', { name: 'Fazer OCR desta página' })).toBeVisible();
});

test('gera PDF pesquisável quando a opção está ligada', async ({ page }) => {
  await page.goto('./#/configuracoes');
  await page.getByLabel('Gerar PDF pesquisável ao fim do OCR').check();
  await setup(page, gabarito.files.mixed.file);
  await pageRow(page, 3).getByRole('button', { name: 'Fazer OCR' }).click();
  await expect(page.getByRole('heading', { name: 'OCR concluído' })).toBeVisible({
    timeout: 120_000,
  });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar PDF pesquisável' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('ip-ficticio-misto-pesquisavel.pdf');
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  expect(doc.numPages).toBe(15);
  const content = await (await doc.getPage(3)).getTextContent();
  const text = content.items
    .map((i) => ('str' in i ? i.str : ''))
    .join(' ')
    .replace(/\s+/g, ' ');
  expect(text).toContain('TERMO DE DECLARAÇÕES DA VÍTIMA');
  await doc.destroy();
});

test('bloquear o cofre interrompe o OCR e preserva as páginas concluídas', async ({ page }) => {
  await setup(page, gabarito.files.scanned);
  await page.getByRole('button', { name: 'Fazer OCR das páginas sem texto (15)' }).click();
  await expect(page.locator('.ocr-panel')).toContainText('1 de 15', { timeout: 60_000 });
  await page.getByRole('banner').getByRole('button', { name: 'Bloquear' }).click();
  await page.getByRole('link', { name: 'Cofres', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  await page.getByLabel(/Senha do cofre/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  await page.getByRole('link', { name: 'Ir para Documentos' }).click();
  await expect(
    page.getByRole('heading', { name: 'OCR interrompido porque o cofre foi bloqueado' }),
  ).toBeVisible();
  await expect(pageRow(page, 1).locator('.kind-badge').first()).toHaveText('OCR feito');
  await expect(pageRow(page, 15).locator('.kind-badge').first()).toHaveText('Imagem');
});
