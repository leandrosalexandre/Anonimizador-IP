// Mede o OCR no IP fictício escaneado (15 páginas), no app de produção e sem internet:
// tempo por página, taxa de erro de caracteres (CER) e acerto de nomes e números do gabarito.
// Uso: npm run build && npm run bench:ocr [-- --mixed] [-- --save]
// --save grava o texto reconhecido em test/fixtures/ocr-escaneado.json (usado nos testes da detecção).
// Obs.: a emulação de CPU lenta do Chrome não afeta Web Workers, onde o OCR roda; para medir no
// tablet, use o tempo médio que o próprio app mostra ao fim do OCR.
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const PORT = 4180;
const BASE = `http://localhost:${PORT}/Anonimizador-IP/`;
const FILE = process.argv.includes('--mixed')
  ? 'ip-ficticio-misto.pdf'
  : 'ip-ficticio-escaneado.pdf';
const FIXTURES = new URL('../test/fixtures/', import.meta.url);
const gabarito = JSON.parse(await readFile(new URL('gabarito.json', FIXTURES), 'utf8'));

const strip = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = (s) => s.replace(/\s+/g, ' ').trim();

function levenshtein(a, b) {
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);

  const pw = 'girassol tapete nuvem bicicleta';
  await page.goto(`${BASE}#/cofres`);
  await page.getByRole('button', { name: 'Novo cofre' }).click();
  await page.getByLabel('Nome do cofre').fill('Medição OCR');
  await page.getByLabel('Senha do cofre', { exact: true }).fill(pw);
  await page.getByLabel('Confirme a senha').fill(pw);
  await page.getByRole('button', { name: 'Criar cofre' }).click();
  await page.getByRole('link', { name: 'Ir para Documentos' }).click();
  await page.getByLabel('Selecionar PDFs').setInputFiles(new URL(FILE, FIXTURES).pathname);
  await page.getByText(`${FILE}:`).waitFor({ timeout: 120_000 });

  const started = Date.now();
  await page.getByRole('button', { name: /Fazer OCR das páginas sem texto/ }).click();
  await page.getByRole('heading', { name: 'OCR concluído' }).waitFor({ timeout: 60 * 60_000 });
  const wall = (Date.now() - started) / 1000;
  const summary = await page.locator('.ocr-panel').textContent();

  const imagePages =
    FILE === 'ip-ficticio-misto.pdf'
      ? gabarito.files.mixed.imagePages
      : gabarito.pages.map((p) => p.pdfPage);
  const rows = [];
  let charsErr = 0;
  let charsTotal = 0;
  const pageTexts = new Map();
  const rawTexts = new Map();
  for (const n of imagePages) {
    const row = page.getByRole('listitem', { name: `Página ${n} do PDF`, exact: true });
    await row.getByRole('button', { name: 'Ver texto' }).click();
    const text = (await row.getByLabel(`Texto da página ${n}`).textContent()) ?? '';
    const folha = await row.locator('.page-folha').textContent();
    const source = await row
      .getByText(/^Folha (detectada|estimada|corrigida|pelo deslocamento)$/)
      .textContent()
      .catch(() => '');
    const expected = gabarito.pages[n - 1];
    const ocr = norm(text);
    const ref = norm(expected.text);
    const err = levenshtein(ocr, ref);
    charsErr += err;
    charsTotal += ref.length;
    pageTexts.set(n, ocr);
    rawTexts.set(n, text);
    rows.push({
      pdf: n,
      fls: folha,
      folhaOk: folha === `fls. ${expected.folha}` && /detectada/.test(source ?? ''),
      cer: `${((err / ref.length) * 100).toFixed(1)}%`,
    });
  }

  if (process.argv.includes('--save')) {
    const out = imagePages.map((n) => ({ pdfPage: n, text: rawTexts.get(n) }));
    await writeFile(new URL('ocr-escaneado.json', FIXTURES), JSON.stringify(out, null, 2) + '\n');
    console.log('Texto do OCR gravado em test/fixtures/ocr-escaneado.json');
  }

  // Acerto de entidades: a ocorrência aparece no texto reconhecido da página?
  const byType = new Map();
  for (const e of gabarito.entities) {
    for (const o of e.occurrences) {
      if (!pageTexts.has(o.pdfPage)) continue;
      const key = e.type === 'PESSOA' ? 'PESSOA (nomes)' : e.type;
      const stat = byType.get(key) ?? { total: 0, exact: 0, noAccent: 0, misses: [] };
      stat.total++;
      const t = pageTexts.get(o.pdfPage);
      const v = norm(o.text);
      if (t.includes(v)) stat.exact++;
      if (strip(t).toLowerCase().includes(strip(v).toLowerCase())) stat.noAccent++;
      else {
        const probe = strip(v).toLowerCase().slice(0, 6);
        const at = strip(t).toLowerCase().indexOf(probe);
        const seen = at >= 0 ? t.slice(at, at + v.length + 10) : '(trecho não localizado)';
        stat.misses.push(`p${o.pdfPage}: "${v}" → OCR: "${seen}"`);
      }
      byType.set(key, stat);
    }
  }

  console.log(`\nArquivo: ${FILE} · tempo total: ${wall.toFixed(1)} s`);
  console.log(`Resumo do app: ${summary}`);
  console.table(rows);
  console.log(`CER geral: ${((charsErr / charsTotal) * 100).toFixed(2)}%`);
  console.log(
    `Folhas detectadas corretamente: ${rows.filter((r) => r.folhaOk).length}/${rows.length}`,
  );
  console.table(
    [...byType].map(([type, s]) => ({
      tipo: type,
      ocorrencias: s.total,
      exatas: `${((s.exact / s.total) * 100).toFixed(0)}%`,
      'sem acento/caixa': `${((s.noAccent / s.total) * 100).toFixed(0)}%`,
    })),
  );
  for (const [type, s] of byType)
    if (s.misses.length) console.log(`Não encontrados (${type}):`, s.misses);
} finally {
  await browser.close();
  server.kill();
}
