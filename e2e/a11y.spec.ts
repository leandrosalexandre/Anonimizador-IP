import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'girassol tapete nuvem bicicleta';

async function audit(page: Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    serious.map(
      (v) =>
        `${name}: ${v.id} — ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}`,
    ),
  ).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`acessibilidade das telas principais (tema ${scheme === 'light' ? 'claro' : 'escuro'})`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('./#/cofres');
    await audit(page, 'Cofres vazio');
    await page.getByRole('button', { name: 'Novo cofre' }).click();
    await audit(page, 'Novo cofre');
    await page.getByLabel('Nome do cofre').fill('IP 900/2026');
    await page.getByLabel('Senha do cofre', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirme a senha').fill(PASSWORD);
    await page.getByRole('button', { name: 'Criar cofre' }).click();
    await expect(page.getByRole('banner')).toContainText('Cofre aberto');
    await audit(page, 'Cofres');
    await page.getByRole('link', { name: 'Ir para Documentos' }).click();
    await page
      .getByLabel('Selecionar PDFs')
      .setInputFiles(new URL('../test/fixtures/ip-ficticio-texto.pdf', import.meta.url).pathname);
    await expect(page.getByText('ip-ficticio-texto.pdf:')).toBeVisible({ timeout: 60_000 });
    await audit(page, 'Documentos');
    await page.getByRole('link', { name: 'Revisão', exact: true }).click();
    await page.getByRole('button', { name: 'Detectar dados pessoais' }).click();
    await expect(page.getByRole('tab', { name: 'Entidades' })).toBeVisible();
    await page.locator('.entity-row .row-button').first().click();
    await audit(page, 'Revisão');
    await page.getByRole('tab', { name: 'Texto' }).click();
    await audit(page, 'Revisão – texto');
    for (const [link, name] of [
      ['Exportar', 'Exportar'],
      ['Reidentificar', 'Reidentificar'],
      ['Configurações', 'Configurações'],
    ]) {
      await page.getByRole('link', { name: link, exact: true }).click();
      await audit(page, name ?? link ?? '');
    }
  });
}
