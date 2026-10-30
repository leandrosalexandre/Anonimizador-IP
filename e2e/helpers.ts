import type { Page } from '@playwright/test';
import { ENTITY_TYPES } from '../src/detectors/types';

/** Registra toda requisição feita pela página (e por seus workers) para outra origem. */
export function trackForeignRequests(page: Page, appOrigin: string): string[] {
  const foreign: string[] = [];
  page.context().on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.origin !== appOrigin) foreign.push(request.url());
  });
  return foreign;
}

/** Aguarda o service worker assumir o controle da página. */
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        }),
      );
    }
  });
}

/**
 * Ativa todos os tipos de dado (o padrão do app pseudonimiza só nomes e documentos pessoais).
 * Os aceites das Fases 4 a 7 do SPEC incluem placas, endereços, e-mails e contas.
 */
export async function enableAllTypes(page: Page): Promise<void> {
  await page.addInitScript(
    (types) => {
      const key = 'anonimizador-ip:settings';
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify({ version: 2, enabledTypes: types }));
    },
    [...ENTITY_TYPES],
  );
}
