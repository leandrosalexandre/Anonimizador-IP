import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { enableAllTypes, trackForeignRequests } from './helpers';

const PASSWORD = 'girassol tapete nuvem bicicleta';
const FIXTURES = new URL('../test/fixtures/', import.meta.url);
const gabarito = JSON.parse(readFileSync(new URL('gabarito.json', FIXTURES), 'utf8')) as {
  entities: { decision: string; variants: string[] }[];
};

test.describe.configure({ timeout: 120_000 });

// Aceites do SPEC com todos os tipos ativos (placas, endereços, e-mails…).
test.beforeEach(({ page }) => enableAllTypes(page));

async function reviewedVault(page: Page) {
  await page.goto('./#/cofres');
  await page.getByRole('button', { name: 'Novo cofre' }).click();
  await page.getByLabel('Nome do cofre').fill('IP 900/2026 – Exportação');
  await page.getByLabel('Senha do cofre', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirme a senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar cofre' }).click();
  await page.getByRole('link', { name: 'Ir para Documentos' }).click();
  await page
    .getByLabel('Selecionar PDFs')
    .setInputFiles(new URL('ip-ficticio-texto.pdf', FIXTURES).pathname);
  await expect(page.getByText('ip-ficticio-texto.pdf:')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('link', { name: 'Revisão', exact: true }).click();
  await page.getByRole('button', { name: 'Detectar dados pessoais' }).click();
  const confirmButtons = page.getByRole('button', { name: /^Confirmar sugestões/ });
  await expect(confirmButtons.first()).toBeVisible();
  for (let i = 0; i < 40 && (await confirmButtons.count()) > 0; i++) {
    await confirmButtons
      .first()
      .click({ timeout: 2000 })
      .catch(() => undefined);
  }
  await expect(confirmButtons).toHaveCount(0);
  await page.getByRole('link', { name: 'Exportar', exact: true }).click();
}

/** Valores reais de envolvidos (fora os que só aparecem dentro de nomes mantidos). */
function leaks(text: string): string[] {
  let searchable = text;
  for (const e of gabarito.entities.filter((x) => x.decision === 'keep')) {
    for (const v of e.variants) searchable = searchable.split(v).join(' ');
  }
  return gabarito.entities
    .filter((e) => e.decision === 'pseudonymize')
    .flatMap((e) => e.variants)
    .filter((v) =>
      new RegExp(
        `(?<![\\p{L}\\p{N}])${v.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![\\p{L}\\p{N}])`,
        'iu',
      ).test(searchable),
    );
}

test('exporta o IP fictício sem dados reais, após a varredura residual', async ({
  page,
  context,
  baseURL,
}) => {
  const foreign = trackForeignRequests(page, new URL(baseURL ?? '').origin);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await reviewedVault(page);

  // Varredura residual: itens a conferir bloqueiam as saídas.
  await expect(page.getByText(/Confira \d+ itens? que ainda parecem dado pessoal/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copiar' })).toBeDisabled();
  const first = page.locator('.residual-row').first();
  await first.getByRole('button', { name: 'Não é dado pessoal' }).click();
  await page.getByRole('button', { name: 'Confirmar todos os itens restantes…' }).click();
  await page.getByRole('button', { name: 'Confirmo que nenhum destes é dado pessoal' }).click();
  await expect(
    page.getByText(/Varredura residual: nenhum dado pessoal aparente \(\d+ itens confirmados/),
  ).toBeVisible();

  // Copiar: mostra o resultado da varredura e o texto não tem dados reais.
  await page.getByRole('button', { name: 'Copiar' }).click();
  await expect(page.getByText(/^Texto copiado\. Varredura residual/)).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.startsWith('Este texto foi pseudonimizado.')).toBe(true);
  expect(copied).toContain('=== fls. 3 (PDF p. 1) ===');
  expect(copied).toContain('[VÍTIMA 1]');
  expect(copied).toContain('Legenda: ');
  expect(leaks(copied)).toEqual([]);

  // Baixar .txt e .md.
  const txtPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar .txt' }).click();
  const txt = await txtPromise;
  expect(txt.suggestedFilename()).toBe('texto-pseudonimizado.txt');
  expect(await readFile(await txt.path(), 'utf8')).toBe(copied);
  const mdPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar .md' }).click();
  const md = await mdPromise;
  expect(await readFile(await md.path(), 'utf8')).toContain('### fls. 3 (PDF p. 1)');

  // Divisão em partes.
  await page.getByLabel('Dividir em partes').selectOption({ label: '~30 mil caracteres' });
  const parts = page.locator('.part-list li');
  const count = await parts.count();
  if (count > 1) await expect(parts.first()).toContainText(`Parte 1 de ${count}`);
  await expect(page.getByLabel('Texto exportado')).toContainText(
    count > 1 ? `Parte 1 de ${count}` : '=== fls. 3',
  );
  expect(foreign).toEqual([]);
});

test('pseudonimizar a partir da varredura residual', async ({ page }) => {
  await reviewedVault(page);
  const row = page.locator('.residual-row', { hasText: '456/2026' });
  await row.getByRole('button', { name: 'Pseudonimizar' }).click();
  await expect(page.locator('.residual-row', { hasText: '456/2026' })).toHaveCount(0);
  await expect(page.getByLabel('Texto exportado')).toContainText('OFÍCIO Nº [DADO 1]');
});
