import { expect, test } from '@playwright/test';
import { trackForeignRequests, waitForServiceWorker } from './helpers';

const ETAPAS = ['Cofres', 'Documentos', 'Revisão', 'Exportar', 'Reidentificar', 'Configurações'];

test('percorre todas as etapas sem nenhuma requisição externa (SPEC 2.9)', async ({
  page,
  baseURL,
}) => {
  const foreign = trackForeignRequests(page, new URL(baseURL ?? '').origin);
  const cspErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) {
      cspErrors.push(msg.text());
    }
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cofres');
  for (const etapa of ETAPAS) {
    await page
      .getByRole('navigation', { name: 'Etapas' })
      .getByRole('link', { name: etapa })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(etapa);
  }
  await waitForServiceWorker(page);

  expect(foreign).toEqual([]);
  expect(cspErrors).toEqual([]);
});

test('aplica a CSP restritiva via meta tag', async ({ page }) => {
  await page.goto('./');
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).not.toContain("'unsafe-eval'");
});

test('expõe um manifesto instalável', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  if (!href) throw new Error('Manifesto ausente');
  const response = await request.get(new URL(href, page.url()).toString());
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as {
    name: string;
    display: string;
    orientation: string;
    icons: { sizes: string; purpose?: string }[];
  };
  expect(manifest.name).toBe('Anonimizador de IP');
  expect(manifest.display).toBe('standalone');
  expect(manifest.orientation).toBe('any');
  const sizes = manifest.icons.map((i) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
});

test('abre e navega sem internet após a primeira carga', async ({ page, context }) => {
  await page.goto('./');
  await waitForServiceWorker(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cofres');
  await expect(page.getByText('Sem internet · funcionando offline')).toBeVisible();

  await page.goto('./#/revisao');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Revisão');
  await page.getByRole('link', { name: 'Exportar' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Exportar');
});

test('alvos de toque da navegação têm pelo menos 44 px', async ({ page }) => {
  await page.goto('./');
  const links = page.getByRole('navigation', { name: 'Etapas' }).getByRole('link');
  for (const box of await links.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().height),
  )) {
    expect(box).toBeGreaterThanOrEqual(44);
  }
});

test('o Chrome considera o app instalável', async ({ page, context }) => {
  await page.goto('./');
  await waitForServiceWorker(page);
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: { errorId: string }[];
  };
  expect(installabilityErrors.map((e) => e.errorId)).toEqual([]);
});
