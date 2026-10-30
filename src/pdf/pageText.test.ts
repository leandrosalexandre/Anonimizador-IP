// @vitest-environment node
// Extração real do IP fictício com o pdf.js (build legado para Node).
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { extractPageText, type ExtractedPageText } from './pageText';
import { resolveFolhas, suggestOffset } from './folhas';

interface Gabarito {
  folhaOffset: number;
  files: { text: string; scanned: string; mixed: { file: string; imagePages: number[] } };
  pages: { pdfPage: number; folha: number; text: string }[];
}

const FIXTURES = new URL('../../test/fixtures/', import.meta.url);
const gabarito = JSON.parse(await readFile(new URL('gabarito.json', FIXTURES), 'utf8')) as Gabarito;

async function extractAll(file: string): Promise<ExtractedPageText[]> {
  const data = new Uint8Array(await readFile(new URL(file, FIXTURES)));
  const doc = (await getDocument({ data, verbosity: 0 }).promise) as unknown as PDFDocumentProxy;
  const pages: ExtractedPageText[] = [];
  for (let i = 1; i <= doc.numPages; i++) pages.push(await extractPageText(await doc.getPage(i)));
  await doc.destroy();
  return pages;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);

describe('extração do IP fictício (PDF com texto)', async () => {
  const pages = await extractAll(gabarito.files.text);

  it('lê as 15 páginas como "com texto"', () => {
    expect(pages).toHaveLength(gabarito.pages.length);
    expect(pages.every((p) => p.kind === 'text')).toBe(true);
  });

  it.each(gabarito.pages)('reconstrói o texto da p. $pdfPage na ordem de leitura', (expected) => {
    const page = pages[expected.pdfPage - 1];
    expect(words(page?.text ?? '')).toEqual(words(expected.text));
  });

  it('mantém as quebras de linha (uma linha por linha do documento)', () => {
    const first = (pages[0]?.text.split('\n') ?? []).filter(Boolean);
    expect(first.slice(0, 5)).toEqual([
      'Fls. 3',
      'ESTADO DO CEARÁ',
      'SECRETARIA DA SEGURANÇA PÚBLICA E DEFESA SOCIAL',
      'POLÍCIA CIVIL DO ESTADO DO CEARÁ',
      'DELEGACIA DE POLÍCIA FICTÍCIA DO 99º DISTRITO',
    ]);
  });

  it('detecta a folha de todas as páginas (carimbo e número isolado)', () => {
    expect(pages.map((p) => p.folhaDetected)).toEqual(gabarito.pages.map((p) => p.folha));
    expect(suggestOffset(pages.map((p) => ({ ...p, folhaManual: null })))).toBe(
      gabarito.folhaOffset,
    );
  });
});

describe('extração do IP fictício (escaneado e misto)', () => {
  it('marca todas as páginas escaneadas como "imagem"', async () => {
    const pages = await extractAll(gabarito.files.scanned);
    expect(pages).toHaveLength(gabarito.pages.length);
    expect(pages.every((p) => p.kind === 'image' && p.text === '')).toBe(true);
  });

  it('no PDF misto, separa páginas com texto e imagem e infere as folhas', async () => {
    const pages = await extractAll(gabarito.files.mixed.file);
    const imagePages = pages.filter((p) => p.kind === 'image').map((p) => p.pdfPage);
    expect(imagePages).toEqual(gabarito.files.mixed.imagePages);
    const resolved = resolveFolhas(
      pages.map((p) => ({ ...p, folhaManual: null })),
      null,
    );
    expect(resolved.map((r) => r.folha)).toEqual(gabarito.pages.map((p) => p.folha));
    expect(resolved.filter((r) => r.source === 'inferred')).toHaveLength(4);
  });
});
