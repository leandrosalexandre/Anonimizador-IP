// Fluxo rápido: colar um relato, anonimizar na hora, reidentificar a resposta da IA e baixar o
// relatório em Word. Nomes fictícios.
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { trackForeignRequests } from './helpers';

const PASSWORD = 'girassol tapete nuvem bicicleta';
const RELATO = [
  'AUTO DE PRISÃO EM FLAGRANTE DELITO',
  'INFRATOR: DANILO EUFRÁSIO DOS REIS',
  'CONDUTOR: BRUNO HENRIQUE TAVARES DE LIMA',
  'TESTEMUNHAS: SÉRGIO AUGUSTO FARIAS',
  '',
  'BRUNO HENRIQUE TAVARES DE LIMA , CPF 529.982.247-25, mãe IRACI TAVARES DE LIMA, pai OSVALDO PEREIRA DE LIMA, nascido no(a) Brasil.',
  'Disse: que é Oficial Investigador de Polícia; QUE a equipe localizou DANILO EUFRÁSIO DOS REIS, filho de MARLENE EUFRÁSIO DOS REIS;',
  'QUE DANILO resistiu à prisão e SÉRGIO presenciou os fatos; QUE DA-',
  'NILO foi conduzido à delegacia.',
].join('\n');

test.describe.configure({ timeout: 120_000 });

test('colar texto: anonimiza na hora, reidentifica e baixa o relatório em Word', async ({
  page,
  context,
  baseURL,
}) => {
  const foreign = trackForeignRequests(page, new URL(baseURL ?? '').origin);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./#/cofres');
  await page.getByRole('button', { name: 'Novo cofre' }).click();
  await page.getByLabel('Nome do cofre').fill('APF 057/2026');
  await page.getByLabel('Senha do cofre', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirme a senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar cofre' }).click();
  await page.getByRole('link', { name: 'Ir para Documentos' }).click();

  await page.getByRole('tab', { name: 'Colar texto' }).click();
  await page.getByLabel('Título (opcional, sem nomes de pessoas)').fill('Depoimento do condutor');
  await page.getByLabel('Texto', { exact: true }).fill(RELATO);
  await page.getByRole('button', { name: 'Anonimizar texto' }).click();

  const result = page.getByLabel('Resultado da anonimização');
  await expect(result).toContainText('INFRATOR: [AUTOR 1]');
  const text = (await result.textContent()) ?? '';
  expect(text).toContain('=== Depoimento do condutor ===');
  expect(text).toContain('CONDUTOR: BRUNO HENRIQUE TAVARES DE LIMA');
  expect(text).toContain('QUE [AUTOR 1] resistiu à prisão e [TESTEMUNHA 1] presenciou');
  expect(text).toContain('QUE [AUTOR 1]\nfoi conduzido');
  expect(text).toMatch(/filho de \[FAMILIAR \d\];/);
  for (const name of ['DANILO', 'EUFRÁSIO', 'MARLENE', 'IRACI', 'OSVALDO', 'SÉRGIO', '529.982'])
    expect(text, name).not.toContain(name);

  await page.getByRole('button', { name: 'Copiar texto anonimizado' }).click();
  await expect(page.getByText(/^Texto anonimizado copiado/)).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('[AUTOR 1]');
  await expect(page.getByRole('article', { name: 'Depoimento do condutor' })).toContainText(
    'Texto colado',
  );

  // Resposta da IA → reidentificar → Word.
  await page.getByRole('link', { name: 'Ir para Reidentificar' }).click();
  await page
    .getByLabel('Análise devolvida pela IA')
    .fill(
      [
        'RELATÓRIO FINAL DE INQUÉRITO',
        'REFERÊNCIA: APF 057/2026',
        'Indiciado(s): [AUTOR 1]',
        '',
        'DOS FATOS',
        'O [AUTOR 1] resistiu à prisão, conforme a [TESTEMUNHA 1].',
        '',
        'É o relatório.',
      ].join('\n'),
    );
  await expect(page.getByRole('article', { name: 'Análise reidentificada' })).toContainText(
    'O Danilo Eufrásio dos Reis resistiu à prisão, conforme a Sérgio Augusto Farias.',
  );
  await page.getByText('Assinatura e rodapé (ficam salvos neste aparelho)').click();
  await page.getByLabel('Nome de quem assina').fill('FULANO FICTÍCIO DE TAL');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar Word (.docx)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('relatorio-final.docx');
  const path = await file.path();
  expect(execFileSync('unzip', ['-t', path], { encoding: 'utf8' })).toContain('No errors detected');
  const xml = execFileSync('unzip', ['-p', path, 'word/document.xml'], { encoding: 'utf8' });
  expect(xml).toContain('Danilo Eufrásio dos Reis');
  expect(xml).toContain('FULANO FICTÍCIO DE TAL');
  expect(execFileSync('unzip', ['-l', path], { encoding: 'utf8' })).toContain(
    'word/media/pcce.png',
  );
  expect(foreign).toEqual([]);
});
