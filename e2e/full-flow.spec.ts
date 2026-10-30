// Fluxo completo do SPEC (Fase 8), sem internet depois da primeira carga e sem nenhuma requisição
// para outra origem: criar cofre → importar → OCR → revisar → exportar → reidentificar.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { trackForeignRequests, waitForServiceWorker } from './helpers';

const PASSWORD = 'girassol tapete nuvem bicicleta';
const FIXTURES = new URL('../test/fixtures/', import.meta.url);
const gabarito = JSON.parse(readFileSync(new URL('gabarito.json', FIXTURES), 'utf8')) as {
  entities: { decision: string; variants: string[] }[];
};

test.describe.configure({ timeout: 300_000 });

test('fluxo completo offline: cofre, PDF misto com OCR, revisão, exportação e reidentificação', async ({
  page,
  context,
  baseURL,
}) => {
  const foreign = trackForeignRequests(page, new URL(baseURL ?? '').origin);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.reload();

  // 1. Cofre
  await page.getByRole('button', { name: 'Novo cofre' }).click();
  await page.getByLabel('Nome do cofre').fill('IP 900/2026 – Fluxo completo');
  await page.getByLabel('Senha do cofre', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirme a senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar cofre' }).click();

  // 2. Importar PDF misto
  await page.getByRole('link', { name: 'Ir para Documentos' }).click();
  await page
    .getByLabel('Selecionar PDFs')
    .setInputFiles(new URL('ip-ficticio-misto.pdf', FIXTURES).pathname);
  await expect(page.getByText('15 páginas importadas (4 sem texto, precisam de OCR).')).toBeVisible(
    {
      timeout: 60_000,
    },
  );

  // 3. OCR das páginas escaneadas
  await page.getByRole('button', { name: 'Fazer OCR das páginas sem texto (4)' }).click();
  await expect(page.getByRole('heading', { name: 'OCR concluído' })).toBeVisible({
    timeout: 200_000,
  });

  // 4. Revisão: detectar, ajustar um papel e confirmar tudo
  await page.getByRole('link', { name: 'Revisão', exact: true }).click();
  await page.getByRole('button', { name: 'Detectar dados pessoais' }).click();
  const francisco = page
    .locator('.entity-row')
    .filter({ hasText: 'Francisco Antônio Pereira Lima' })
    .first();
  await francisco.locator('.row-button').click();
  await francisco.getByLabel('Papel').selectOption('AUTOR');
  const confirmButtons = page.getByRole('button', { name: /^Confirmar sugestões/ });
  for (let i = 0; i < 40 && (await confirmButtons.count()) > 0; i++) {
    await confirmButtons
      .first()
      .click({ timeout: 2000 })
      .catch(() => undefined);
  }
  await expect(confirmButtons).toHaveCount(0);

  // 5. Exportar
  await page.getByRole('link', { name: 'Exportar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Varredura residual' })).toBeVisible();
  const confirmAll = page.getByRole('button', { name: 'Confirmar todos os itens restantes…' });
  if ((await confirmAll.count()) > 0) {
    await confirmAll.click();
    await page.getByRole('button', { name: 'Confirmo que nenhum destes é dado pessoal' }).click();
  }
  await page.getByRole('button', { name: 'Copiar' }).click();
  const exported = await page.evaluate(() => navigator.clipboard.readText());
  let searchable = exported;
  for (const e of gabarito.entities.filter((x) => x.decision === 'keep')) {
    for (const v of e.variants) searchable = searchable.split(v).join(' ');
  }
  const leaked = gabarito.entities
    .filter((e) => e.decision === 'pseudonymize')
    .flatMap((e) => e.variants)
    .filter((v) => v.length > 3 && searchable.includes(v));
  expect(leaked).toEqual([]);
  expect(exported).toContain('[AUTOR 1]');

  // 6–7. "Análise da IA" e reidentificação
  await page.getByRole('link', { name: 'Reidentificar', exact: true }).click();
  await page
    .getByLabel('Análise devolvida pela IA')
    .fill(
      'A [VÍTIMA 1] reconheceu o autor 1 (fls. 5), vulgo [APELIDO DE AUTOR 1]. Ver [VÍTIMA 9].',
    );
  const result = page.getByRole('article', { name: 'Análise reidentificada' });
  await expect(result).toContainText(
    'A Maria da Conceição Silva Souza reconheceu o Francisco Antônio Pereira Lima (fls. 5), vulgo Chico Bala.',
  );
  await expect(result.locator('mark.reid-unknown')).toHaveText('[VÍTIMA 9]');

  expect(foreign).toEqual([]);
});

test('navegação por teclado', async ({ page }) => {
  await page.goto('./#/cofres');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
  // Percorre até o link "Documentos" do menu e ativa com Enter.
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    if (
      await page
        .getByRole('link', { name: 'Documentos', exact: true })
        .evaluate((el) => el === document.activeElement)
    )
      break;
  }
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Documentos');
  await page.getByRole('link', { name: 'Sobre e privacidade' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sobre');
  await expect(page.getByText('Nada sai deste aparelho').first()).toBeVisible();
  await page.getByRole('link', { name: 'Como usar' }).last().click();
  await expect(page.locator('.help-steps > li')).toHaveCount(7);
});
