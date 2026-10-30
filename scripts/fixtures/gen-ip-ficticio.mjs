// Gera o IP FICTÍCIO de referência em test/fixtures/ (SPEC Fase 8):
//   ip-ficticio-texto.pdf      – PDF com camada de texto (gerado pelo Chromium)
//   ip-ficticio-escaneado.pdf  – páginas rasterizadas a 200 DPI, com leve rotação e ruído
//   ip-ficticio-misto.pdf      – maioria com texto e algumas páginas "escaneadas"
//   gabarito.json              – páginas, folhas, texto esperado e todas as entidades
// Uso: npm run fixtures   (requer o Chromium do Playwright)
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { ENTITIES } from './ip-ficticio-data.mjs';
import { FOOTER_LINE, HEADER_LINES, NB_END, NB_START, buildPages } from './ip-ficticio-pages.mjs';

const OUT = new URL('../../test/fixtures/', import.meta.url);
const SCAN_DPI = 200;
/** Páginas do PDF (1-based) que ficam "escaneadas" na versão mista. */
const MIXED_IMAGE_PAGES = [3, 4, 8, 12];
/** PDF p. 1 corresponde à fls. 3. */
const FOLHA_OFFSET = 2;

const escapeHtml = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replaceAll(NB_START, '<span class="nb">')
    .replaceAll(NB_END, '</span>');
const plain = (s) => s.replaceAll(NB_START, '').replaceAll(NB_END, '');

function blockHtml(block) {
  if (block.h) return `<h2>${escapeHtml(block.h)}</h2>`;
  if (block.p) return `<p>${escapeHtml(block.p)}</p>`;
  if (block.kv) {
    return `<p class="kv"><strong>${escapeHtml(block.kv[0])}:</strong> ${escapeHtml(block.kv[1])}</p>`;
  }
  if (block.sign) {
    return `<div class="sign">${block.sign
      .map((l) => (l ? `<div>${escapeHtml(l)}</div>` : '<div class="gap"></div>'))
      .join('')}</div>`;
  }
  throw new Error('Bloco inválido');
}

function blockText(block) {
  if (block.h) return [plain(block.h)];
  if (block.p) return [plain(block.p)];
  if (block.kv) return [`${block.kv[0]}: ${plain(block.kv[1])}`];
  if (block.sign) return block.sign.filter(Boolean).map(plain);
  return [];
}

function pageHtml(page) {
  return `<section class="page">
  <div class="stamp${/^\d+$/.test(page.stamp) ? ' bare' : ''}">${escapeHtml(page.stamp)}</div>
  <header>${HEADER_LINES.map((l) => `<div>${escapeHtml(l)}</div>`).join('')}</header>
  <main>${page.blocks.map(blockHtml).join('\n')}</main>
  <footer>${escapeHtml(FOOTER_LINE)}</footer>
</section>`;
}

function pageText(page) {
  return [page.stamp, ...HEADER_LINES, ...page.blocks.flatMap(blockText), FOOTER_LINE].join('\n');
}

const CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: 'DejaVu Serif', 'Liberation Serif', 'Times New Roman', serif; font-size: 11.5pt; line-height: 1.45; color: #111; }
.page { position: relative; width: 210mm; height: 297mm; padding: 30mm 22mm 20mm 25mm; overflow: hidden; page-break-after: always; background: #fff; }
.page:last-child { page-break-after: auto; }
.stamp { position: absolute; top: 10mm; right: 16mm; border: 1.5px solid #233; border-radius: 4px; padding: 2mm 4mm 5mm; font-family: 'DejaVu Sans', Arial, sans-serif; font-size: 12pt; font-weight: bold; }
.stamp::after { content: ''; position: absolute; left: 3mm; right: 3mm; bottom: 1.5mm; height: 2.5mm; border-bottom: 1.5px solid #233; border-radius: 0 0 50% 50%; }
.stamp.bare { border: none; font-size: 14pt; padding: 0; }
.stamp.bare::after { display: none; }
header { text-align: center; font-family: 'DejaVu Sans', Arial, sans-serif; font-size: 9.5pt; font-weight: bold; line-height: 1.35; margin-bottom: 7mm; }
h2 { text-align: center; font-size: 12.5pt; margin: 4mm 0 3mm; }
p { margin: 0 0 2.2mm; text-align: justify; }
p.kv { text-align: left; margin-bottom: 1.2mm; }
span.nb { white-space: nowrap; }
.sign { margin-top: 8mm; text-align: center; }
.sign .gap { height: 6mm; }
footer { position: absolute; bottom: 9mm; left: 25mm; right: 22mm; text-align: center; font-family: 'DejaVu Sans', Arial, sans-serif; font-size: 8pt; color: #555; }
`;

function documentHtml(pages, extraCss = '') {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${CSS}${extraCss}</style></head><body>${pages
    .map(pageHtml)
    .join('\n')}</body></html>`;
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function renderScannedPage(browser, page, index) {
  const random = rng(1000 + index);
  const angle = (random() - 0.5) * 1.6; // até ±0,8°
  const shiftX = (random() - 0.5) * 6;
  const shiftY = (random() - 0.5) * 6;
  const ctx = await browser.newContext({
    viewport: { width: 794, height: 1123 },
    deviceScaleFactor: SCAN_DPI / 96,
  });
  const tab = await ctx.newPage();
  const scanCss = `
    body { background: #f4f2ec; }
    .page { background: transparent; transform: translate(${shiftX}px, ${shiftY}px) rotate(${angle}deg); transform-origin: 50% 50%; filter: grayscale(1) contrast(1.15) blur(0.25px); }
    #noise { position: fixed; inset: 0; pointer-events: none; }`;
  await tab.setContent(documentHtml([page], scanCss));
  await tab.evaluate((seed) => {
    let s = seed;
    const r = () => {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const canvas = document.createElement('canvas');
    canvas.id = 'noise';
    canvas.width = 794 * 2;
    canvas.height = 1123 * 2;
    canvas.style.width = '794px';
    canvas.style.height = '1123px';
    const g = canvas.getContext('2d');
    for (let i = 0; i < 9000; i++) {
      const shade = Math.floor(r() * 90);
      g.fillStyle = `rgba(${shade},${shade},${shade},${0.08 + r() * 0.3})`;
      g.fillRect(r() * canvas.width, r() * canvas.height, 1 + r() * 2.2, 1 + r() * 2.2);
    }
    // Sombra lateral típica de digitalização.
    const grad = g.createLinearGradient(0, 0, 60, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 60, canvas.height);
    document.body.append(canvas);
  }, 5000 + index);
  const jpg = await tab.screenshot({ type: 'jpeg', quality: 70 });
  await ctx.close();
  return jpg;
}

async function imagePdf(jpgs) {
  const doc = await PDFDocument.create();
  for (const jpg of jpgs) {
    const image = await doc.embedJpg(jpg);
    const page = doc.addPage([595.28, 841.89]);
    page.drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }
  return doc;
}

function fixedMetadata(doc, title) {
  const date = new Date('2026-10-29T12:00:00Z');
  doc.setTitle(title);
  doc.setAuthor('Anonimizador de IP – dados fictícios');
  doc.setProducer('Anonimizador de IP (scripts/fixtures)');
  doc.setCreator('Anonimizador de IP (scripts/fixtures)');
  doc.setCreationDate(date);
  doc.setModificationDate(date);
}

async function main() {
  const pages = buildPages();
  pages.forEach((p, i) => {
    if (p.folha !== i + 1 + FOLHA_OFFSET) throw new Error(`Folha inconsistente na p. ${i + 1}`);
  });
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();

  // 1) PDF com texto.
  const tab = await browser.newPage();
  await tab.setContent(documentHtml(pages));
  const textPdfBytes = await tab.pdf({
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
  });
  const textDoc = await PDFDocument.load(textPdfBytes);
  if (textDoc.getPageCount() !== pages.length) {
    throw new Error(`Esperadas ${pages.length} páginas, geradas ${textDoc.getPageCount()}`);
  }
  fixedMetadata(textDoc, 'IP fictício – versão com texto');
  await writeFile(new URL('ip-ficticio-texto.pdf', OUT), await textDoc.save());

  // 2) PDF escaneado.
  const jpgs = [];
  for (let i = 0; i < pages.length; i++) jpgs.push(await renderScannedPage(browser, pages[i], i));
  await browser.close();
  const scanDoc = await imagePdf(jpgs);
  fixedMetadata(scanDoc, 'IP fictício – versão escaneada');
  await writeFile(new URL('ip-ficticio-escaneado.pdf', OUT), await scanDoc.save());

  // 3) PDF misto.
  const mixed = await PDFDocument.create();
  for (let i = 0; i < pages.length; i++) {
    if (MIXED_IMAGE_PAGES.includes(i + 1)) {
      const image = await mixed.embedJpg(jpgs[i]);
      const page = mixed.addPage([595.28, 841.89]);
      page.drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 });
    } else {
      const [copied] = await mixed.copyPages(textDoc, [i]);
      mixed.addPage(copied);
    }
  }
  fixedMetadata(mixed, 'IP fictício – versão mista');
  await writeFile(new URL('ip-ficticio-misto.pdf', OUT), await mixed.save());

  // 4) Gabarito.
  const gabarito = {
    description:
      'Gabarito do IP fictício de referência. Todos os dados são inventados. Gerado por scripts/fixtures/gen-ip-ficticio.mjs.',
    folhaOffset: FOLHA_OFFSET,
    files: {
      text: 'ip-ficticio-texto.pdf',
      scanned: 'ip-ficticio-escaneado.pdf',
      mixed: { file: 'ip-ficticio-misto.pdf', imagePages: MIXED_IMAGE_PAGES },
    },
    pages: pages.map((p, i) => ({
      pdfPage: i + 1,
      folha: p.folha,
      stamp: p.stamp,
      title: p.title,
      text: pageText(p),
    })),
    entities: ENTITIES.map((e) => ({
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
  await writeFile(new URL('gabarito.json', OUT), JSON.stringify(gabarito, null, 2) + '\n');

  const total = gabarito.entities.reduce((n, e) => n + e.occurrences.length, 0);
  console.log(
    `IP fictício gerado: ${pages.length} páginas, ${gabarito.entities.length} entidades, ${total} ocorrências.`,
  );
}

await main();
