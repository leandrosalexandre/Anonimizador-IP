// Gera o IP FICTÍCIO 2 (formato dos documentos do Ceará) em test/fixtures/:
//   ip-ficticio-ce.pdf   – PDF com camada de texto (gerado pelo Chromium), uma linha por linha
//   gabarito-ce.json     – páginas, folhas, texto esperado e todas as entidades
// Uso: npm run fixtures   (requer o Chromium do Playwright)
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { CE_ENTITIES, ceDocuments } from './ip-ce-data.mjs';

const OUT = new URL('../../test/fixtures/', import.meta.url);
/** PDF p. 1 corresponde à fls. 2. */
const FOLHA_OFFSET = 1;

const byId = new Map(CE_ENTITIES.map((e) => [e.id, e]));

/** Monta as páginas: cada E(id, texto) vira o valor no texto e uma ocorrência no gabarito. */
function buildPages() {
  const marks = [];
  const docs = ceDocuments((id, text) => {
    const entity = byId.get(id);
    if (!entity) throw new Error(`Entidade desconhecida: ${id}`);
    const value = text ?? entity.variants[0];
    if (!entity.variants.includes(value)) throw new Error(`Variante não listada (${id}): ${value}`);
    marks.push({ entityId: id, text: value });
    return `\uE000${marks.length - 1}\uE001`;
  });
  return docs.map((d) => {
    const occurrences = [];
    const lines = d.lines.map((line) =>
      line.replace(/\uE000(\d+)\uE001/g, (_, n) => {
        const o = marks[Number(n)];
        occurrences.push(o);
        return o.text;
      }),
    );
    return { ...d, lines, stamp: `Fls. ${d.folha}`, occurrences };
  });
}

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const pageLines = (p) => p.lines.flatMap((l) => l.split('\n'));

function pageHtml(p) {
  return `<section class="page"><div class="stamp">${escapeHtml(p.stamp)}</div>
<main>${pageLines(p)
    .map((l) => `<div class="line">${escapeHtml(l)}</div>`)
    .join('')}</main></section>`;
}

const CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: 'DejaVu Sans', Arial, sans-serif; font-size: 9pt; line-height: 1.6; color: #111; }
.page { position: relative; width: 210mm; height: 297mm; padding: 28mm 12mm 20mm 14mm; overflow: hidden; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.stamp { position: absolute; top: 10mm; right: 14mm; font-size: 12pt; font-weight: bold; }
.line { white-space: pre; }
`;

async function main() {
  const pages = buildPages();
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const tab = await browser.newPage();
  await tab.setContent(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${pages
      .map(pageHtml)
      .join('\n')}</body></html>`,
  );
  const bytes = await tab.pdf({ format: 'A4', preferCSSPageSize: true });
  await browser.close();
  const doc = await PDFDocument.load(bytes);
  if (doc.getPageCount() !== pages.length) {
    throw new Error(`Esperadas ${pages.length} páginas, geradas ${doc.getPageCount()}`);
  }
  const date = new Date('2026-10-29T12:00:00Z');
  doc.setTitle('IP fictício 2 – formato Ceará');
  doc.setAuthor('Anonimizador de IP – dados fictícios');
  doc.setProducer('Anonimizador de IP (scripts/fixtures)');
  doc.setCreator('Anonimizador de IP (scripts/fixtures)');
  doc.setCreationDate(date);
  doc.setModificationDate(date);
  await writeFile(new URL('ip-ficticio-ce.pdf', OUT), await doc.save());

  const gabarito = {
    description:
      'Gabarito do IP fictício 2 (formato Ceará). Todos os dados são inventados. Gerado por scripts/fixtures/gen-ip-ficticio-ce.mjs.',
    folhaOffset: FOLHA_OFFSET,
    files: { text: 'ip-ficticio-ce.pdf' },
    pages: pages.map((p, i) => ({
      pdfPage: i + 1,
      folha: p.folha,
      stamp: p.stamp,
      title: p.title,
      text: [p.stamp, ...pageLines(p)].join('\n'),
    })),
    // Datas de nascimento ficam fora do escopo padrão (não são pseudonimizadas).
    entities: CE_ENTITIES.filter((e) => !e.outOfScope).map(({ outOfScope: _, ...e }) => ({
      ...e,
      decision: e.decision ?? 'pseudonymize',
      occurrences: pages.flatMap((p, i) =>
        p.occurrences
          .filter((o) => o.entityId === e.id)
          .map((o) => ({ pdfPage: i + 1, folha: p.folha, text: o.text })),
      ),
    })),
  };
  const unused = gabarito.entities.filter((e) => e.occurrences.length === 0).map((e) => e.id);
  if (unused.length) throw new Error(`Entidades sem ocorrência: ${unused.join(', ')}`);
  await writeFile(new URL('gabarito-ce.json', OUT), JSON.stringify(gabarito, null, 2) + '\n');
  const total = gabarito.entities.reduce((n, e) => n + e.occurrences.length, 0);
  console.log(
    `IP fictício 2 gerado: ${pages.length} páginas, ${gabarito.entities.length} entidades, ${total} ocorrências.`,
  );
}

await main();
