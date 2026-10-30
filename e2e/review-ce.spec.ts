// IP fictício 2 (formato Ceará), com o escopo padrão: a revisão separa pessoas, documentos e
// sugestões, e o texto exportado mantém em claro municípios, órgãos e termos médicos.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { trackForeignRequests } from './helpers';

const PASSWORD = 'girassol tapete nuvem bicicleta';
const FIXTURES = new URL('../test/fixtures/', import.meta.url);
const gabarito = JSON.parse(readFileSync(new URL('gabarito-ce.json', FIXTURES), 'utf8')) as {
  entities: { type: string; decision: string; variants: string[] }[];
};

test.describe.configure({ timeout: 120_000 });

test('IP no formato do Ceará: blocos da revisão e exportação no escopo padrão', async ({
  page,
  context,
  baseURL,
}) => {
  const foreign = trackForeignRequests(page, new URL(baseURL ?? '').origin);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./#/cofres');
  await page.getByRole('button', { name: 'Novo cofre' }).click();
  await page.getByLabel('Nome do cofre').fill('IP 512/2026 – Santana');
  await page.getByLabel('Senha do cofre', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirme a senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar cofre' }).click();
  await page.getByRole('link', { name: 'Ir para Documentos' }).click();
  await page
    .getByLabel('Selecionar PDFs')
    .setInputFiles(new URL('ip-ficticio-ce.pdf', FIXTURES).pathname);
  await expect(page.getByText('ip-ficticio-ce.pdf:')).toBeVisible({ timeout: 60_000 });

  await page.getByRole('link', { name: 'Revisão', exact: true }).click();
  await page.getByRole('button', { name: 'Detectar dados pessoais' }).click();

  // 15 pessoas + 1 apelido; 13 documentos (CPF, RG, telefone, nascimento, título, CNS, prontuário).
  await expect(page.getByLabel('Totais')).toHaveText(
    '16 pessoas · 13 documentos · 0 sugestões não aplicadas',
  );
  const people = page.getByRole('region', { name: 'Pessoas', exact: true });
  await expect(people.getByRole('region', { name: 'Autores' })).toContainText(
    'José Wellington Mota Silva',
  );
  await expect(people.getByRole('region', { name: 'Autores' }).locator('.entity-row')).toHaveCount(
    3,
  );
  await expect(
    people.getByRole('region', { name: 'Familiares' }).locator('.entity-row'),
  ).toHaveCount(6);
  await expect(people.getByRole('region', { name: 'Médicos' })).toContainText(
    'Henrique Moura Leite',
  );
  await expect(people.getByRole('region', { name: 'Testemunhas' })).toContainText(
    'papéis diferentes',
  );

  // Confirma tudo e exporta.
  const confirmButtons = page.getByRole('button', { name: /^Confirmar sugestões/ });
  for (let i = 0; i < 20 && (await confirmButtons.count()) > 0; i++) {
    await confirmButtons
      .first()
      .click({ timeout: 2000 })
      .catch(() => undefined);
  }
  await expect(confirmButtons).toHaveCount(0);
  await page.getByRole('link', { name: 'Exportar', exact: true }).click();
  const exported = page.getByLabel('Texto exportado');
  await expect(exported).toContainText('[VÍTIMA 1]');
  const text = (await exported.textContent()) ?? '';

  for (const clear of [
    'SANTANA DO ACARAÚ/CE',
    'Natureza do Fato: HOMICÍDIO TENTADO',
    'SANTA CASA DE SOBRAL',
    'fratura de rádio e ulna',
    'RUA CORONEL ANTÔNIO FIRMO',
    'BOLETIM DE OCORRÊNCIA Nº 512-347/2026',
    'FELIPE AUGUSTO MACHADO RIOS',
  ]) {
    expect(text, clear).toContain(clear);
  }
  expect(text).toContain('Filiação: [FAMILIAR 1] / [FAMILIAR 2]');
  expect(text).toContain('ACUSADOS: [AUTOR 1], [AUTOR 2] E [AUTOR 3]');
  expect(text).toMatch(/Médico: Dr\. \[MÉDICO 1\] - CRM 12345/);
  expect(text).toMatch(/A vítima \[VÍTIMA 1\] já havia sido removida/);
  for (const e of gabarito.entities.filter((x) => x.decision === 'pseudonymize')) {
    for (const v of e.variants)
      expect(text.replace(/\s+/g, ' '), v).not.toContain(v.replace(/\s+/g, ' '));
  }
  expect(foreign).toEqual([]);
});
