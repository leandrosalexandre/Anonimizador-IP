import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { trackForeignRequests } from './helpers';

const PASSWORD = 'girassol tapete nuvem bicicleta';
const FIXTURE = new URL('../test/fixtures/ip-ficticio-texto.pdf', import.meta.url).pathname;

test.describe.configure({ timeout: 120_000 });

async function reviewedVault(page: Page) {
  await page.goto('./#/cofres');
  await page.getByRole('button', { name: 'Novo cofre' }).click();
  await page.getByLabel('Nome do cofre').fill('IP 900/2026 – Reidentificação');
  await page.getByLabel('Senha do cofre', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirme a senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar cofre' }).click();
  await page.getByRole('link', { name: 'Ir para Documentos' }).click();
  await page.getByLabel('Selecionar PDFs').setInputFiles(FIXTURE);
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
}

// Análise "devolvida pela IA" com as variações que o app precisa tolerar.
const ANALYSIS = [
  'Síntese: a [VÍTIMA 1] reconheceu o [INVESTIGADO 1], vulgo "[APELIDO DE INVESTIGADO 1]" (fls. 5).',
  'A Vitima 1 informou o CPF [CPF 1]; a vítima 1 mora na [ENDEREÇO DE VÍTIMA 1].',
  'As TESTEMUNHAS 1 e 2 confirmam a dinâmica.',
  'Não há elementos contra a [VÍTIMA 9].',
].join('\n');

test('reidentifica a análise da IA com tolerância e relata marcadores desconhecidos', async ({
  page,
  context,
  baseURL,
}) => {
  const foreign = trackForeignRequests(page, new URL(baseURL ?? '').origin);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await reviewedVault(page);
  await page.getByRole('link', { name: 'Reidentificar', exact: true }).click();
  await page.getByLabel('Análise devolvida pela IA').fill(ANALYSIS);

  const result = page.getByRole('article', { name: 'Análise reidentificada' });
  await expect(result).toContainText(
    'a Maria da Conceição Silva Souza reconheceu o Francisco Antônio Pereira Lima, vulgo "Chico Bala" (fls. 5).',
  );
  await expect(result).toContainText(
    'A Maria da Conceição Silva Souza informou o CPF 529.982.247-25',
  );
  await expect(result).toContainText('mora na Rua das Acácias Fictícias, nº 145');
  await expect(result).toContainText(
    'As João Batista Ferreira Neto e Ana Cláudia Rodrigues Matos confirmam',
  );
  await expect(result.locator('mark.reid-unknown')).toHaveText('[VÍTIMA 9]');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Marcadores desconhecidos' }),
  ).toContainText('[VÍTIMA 9]');

  // Formato com papel.
  await page.getByLabel('Nome com papel (Maria da Silva (vítima))').check();
  await expect(result).toContainText('Maria da Conceição Silva Souza (vítima)');

  // Copiar exige confirmar o aviso.
  await page.getByRole('button', { name: 'Copiar', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: 'Aviso de cópia' })).toContainText(
    'nomes e dados reais',
  );
  await page.getByRole('button', { name: 'Entendi, copiar' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    'Maria da Conceição Silva Souza (vítima)',
  );

  // Baixar e imprimir (folha de estilo de impressão só com o resultado).
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar .txt' }).click();
  expect(await readFile(await (await download).path(), 'utf8')).toContain('Chico Bala');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('banner')).toBeHidden();
  await expect(page.getByLabel('Análise devolvida pela IA')).toBeHidden();
  await expect(result).toBeVisible();
  await page.emulateMedia({ media: 'screen' });

  // Histórico cifrado no cofre.
  await page.getByLabel('Guardar a análise no cofre').fill('Análise preliminar');
  await page.getByRole('button', { name: 'Salvar no cofre' }).click();
  await page.getByRole('button', { name: 'Limpar' }).click();
  await page.getByRole('button', { name: 'Abrir' }).click();
  await expect(result).toContainText('Chico Bala');
  expect(foreign).toEqual([]);
});

test('importa a análise de um arquivo .md', async ({ page }) => {
  await reviewedVault(page);
  await page.getByRole('link', { name: 'Reidentificar', exact: true }).click();
  await page.getByLabel('Importar .txt ou .md').setInputFiles({
    name: 'analise.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Parecer\n\nA **[VÍTIMA 1]** e o [PERITO 1].'),
  });
  const result = page.getByRole('article', { name: 'Análise reidentificada' });
  await expect(result).toContainText('A **Maria da Conceição Silva Souza** e o [PERITO 1].');
  await expect(result.locator('mark.reid-unknown')).toHaveText('[PERITO 1]');
});
