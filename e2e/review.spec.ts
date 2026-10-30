import { expect, test, type Page } from '@playwright/test';
import { enableAllTypes, trackForeignRequests } from './helpers';

const PASSWORD = 'girassol tapete nuvem bicicleta';
const FIXTURE = new URL('../test/fixtures/ip-ficticio-texto.pdf', import.meta.url).pathname;

test.describe.configure({ timeout: 120_000 });

// Aceites do SPEC com todos os tipos ativos (placas, endereços, e-mails…).
test.beforeEach(({ page }) => enableAllTypes(page));

async function setup(page: Page) {
  await page.goto('./#/cofres');
  await page.getByRole('button', { name: 'Novo cofre' }).click();
  await page.getByLabel('Nome do cofre').fill('IP 900/2026 – Revisão');
  await page.getByLabel('Senha do cofre', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirme a senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar cofre' }).click();
  await page.getByRole('link', { name: 'Ir para Documentos' }).click();
  await page.getByLabel('Selecionar PDFs').setInputFiles(FIXTURE);
  await expect(page.getByText('ip-ficticio-texto.pdf:')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('link', { name: 'Revisão', exact: true }).click();
  await page.getByRole('button', { name: 'Detectar dados pessoais' }).click();
  await expect(page.getByRole('tab', { name: 'Entidades' })).toBeVisible();
}

const row = (page: Page, name: string) =>
  page.locator('.entity-row').filter({ has: page.getByText(name, { exact: true }) });

/** Seleciona um trecho do texto da página (como o usuário faria com o dedo ou o mouse). */
async function selectText(page: Page, needle: string) {
  await page.evaluate((n) => {
    const root = document.querySelector('.review-text-body');
    if (!root) throw new Error('texto ausente');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const i = node.textContent?.indexOf(n) ?? -1;
      if (i >= 0) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + n.length);
        const sel = document.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        return;
      }
    }
    throw new Error(`trecho não encontrado: ${n}`);
  }, needle);
}

test('fluxo de revisão completo libera a exportação', async ({ page, baseURL }) => {
  const foreign = trackForeignRequests(page, new URL(baseURL ?? '').origin);
  await setup(page);

  const status = page.locator('.review-progress');
  await expect(status).toContainText('0 de');
  await expect(status).toContainText('sem decisão (a exportação fica bloqueada)');

  // Exportação bloqueada.
  await page.getByRole('link', { name: 'Exportar', exact: true }).click();
  await expect(page.getByText('Exportação bloqueada.')).toBeVisible();
  await page.getByRole('link', { name: 'Revisão', exact: true }).click();

  // Grupos e sugestões.
  await expect(page.getByRole('region', { name: 'Vítimas' })).toContainText(
    'Maria da Conceição Silva Souza',
  );
  await expect(row(page, 'Maria da Conceição Silva Souza').locator('.chip')).toHaveText(
    '[VÍTIMA 1]',
  );
  await expect(
    page.getByRole('region', { name: 'Pessoas mantidas (autoridades e servidores)' }),
  ).toContainText('Paulo Roberto Cavalcante Mendes');

  // Atribuir papel: o investigado é o autor.
  const francisco = row(page, 'Francisco Antônio Pereira Lima');
  await francisco.locator('.row-button').click();
  await francisco.getByLabel('Papel').selectOption('AUTOR');
  await expect(row(page, 'Francisco Antônio Pereira Lima').locator('.chip')).toHaveText(
    '[AUTOR 1]',
  );
  await expect(row(page, 'Chico Bala').locator('.chip')).toHaveText('[APELIDO DE AUTOR 1]');

  // Descartar falso positivo.
  const avenida = row(page, 'Avenida Central');
  await avenida.locator('.row-button').click();
  await avenida.getByRole('button', { name: 'Descartar (não é dado pessoal)' }).click();
  await avenida.getByRole('button', { name: 'Confirmar descarte' }).click();
  await expect(row(page, 'Avenida Central')).toHaveCount(0);

  // Mesclar dois endereços (curto + completo da vítima).
  await row(page, 'Rua das Acácias Fictícias').getByRole('checkbox').check();
  await row(
    page,
    'Rua das Acácias Fictícias, nº 145, Apto 302, Bairro Jardim Imaginário, Fortaleza/CE',
  )
    .getByRole('checkbox')
    .check();
  await page.getByRole('button', { name: 'Mesclar na primeira' }).click();
  await expect(
    row(
      page,
      'Rua das Acácias Fictícias, nº 145, Apto 302, Bairro Jardim Imaginário, Fortaleza/CE',
    ),
  ).toHaveCount(1);

  // Texto: destaques, marcação manual e comparação lado a lado.
  await page.getByRole('tab', { name: 'Texto' }).click();
  await page.getByLabel('Página').selectOption({ label: 'fls. 4' });
  await expect(page.locator('.review-text-body mark').first()).toBeVisible();
  await selectText(page, 'VW Gol');
  await page.getByRole('button', { name: 'Marcar seleção como dado pessoal' }).click();
  await page
    .getByRole('dialog', { name: 'Marcar trecho selecionado' })
    .getByLabel('Tipo')
    .selectOption('OUTRO');
  await page.getByRole('button', { name: 'Marcar', exact: true }).click();
  await expect(page.locator('.focus-panel')).toContainText('[DADO 1]');

  // Tocar num destaque abre a entidade.
  await page
    .locator('.review-text-body mark', { hasText: 'MARIA DA CONCEIÇÃO SILVA SOUZA' })
    .first()
    .click();
  await expect(page.locator('.focus-panel .detail-label')).toHaveText('[VÍTIMA 1]');

  await page.getByLabel('Original × pseudonimizado').check();
  const pseudo = page.getByLabel('Texto pseudonimizado');
  await expect(pseudo).toContainText('Nome: [VÍTIMA 1]');
  await expect(pseudo).toContainText('CPF: [CPF 1]');
  await expect(pseudo).toContainText('automóvel [DADO 1], cor prata');
  await expect(pseudo).not.toContainText('MARIA');
  await expect(pseudo).not.toContainText('98812-3456');

  // Confirmar todas as sugestões, grupo a grupo.
  await page.getByRole('tab', { name: 'Entidades' }).click();
  const confirmButtons = page.getByRole('button', { name: /^Confirmar sugestões/ });
  for (let i = 0; i < 40 && (await confirmButtons.count()) > 0; i++) {
    // O botão some do grupo assim que as sugestões são confirmadas.
    await confirmButtons
      .first()
      .click({ timeout: 2000 })
      .catch(() => undefined);
  }
  await expect(confirmButtons).toHaveCount(0);
  await expect(status).not.toContainText('sem decisão');
  await expect(status).toContainText(/(\d+) de \1 entidades revisadas/);

  await page.getByRole('link', { name: 'Exportar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Varredura residual' })).toBeVisible();
  expect(foreign).toEqual([]);
});

test('decisões persistem após bloquear e nova detecção não desfaz a revisão', async ({ page }) => {
  await setup(page);
  const francisco = row(page, 'Francisco Antônio Pereira Lima');
  await francisco.locator('.row-button').click();
  await francisco.getByLabel('Papel').selectOption('AUTOR');
  await expect(francisco.locator('.chip')).toHaveText('[AUTOR 1]');

  await page.getByRole('banner').getByRole('button', { name: 'Bloquear' }).click();
  await page.getByRole('link', { name: 'Cofres', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  await page.getByLabel(/Senha do cofre/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  await page.getByRole('link', { name: 'Revisão', exact: true }).click();
  await page.getByRole('button', { name: 'Detectar de novo' }).click();
  await expect(row(page, 'Francisco Antônio Pereira Lima').locator('.chip')).toHaveText(
    '[AUTOR 1]',
  );
  await expect(row(page, 'Francisco Antônio Pereira Lima')).toContainText('revisada');
});
