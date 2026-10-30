import { describe, expect, it } from 'vitest';
import { detectFolha, parseFolhaStamp, resolveFolhas, suggestOffset } from './folhas';
import type { TextLine } from './layout';

const W = 595;
const H = 842;
const line = (text: string, y: number, x = 60, right = x + text.length * 6): TextLine => ({
  text,
  x,
  y,
  right,
  fontSize: 11,
});

describe('detectFolha', () => {
  it.each([
    ['Fls. 12', 12],
    ['Fl. 7', 7],
    ['FLS.: 103', 103],
    ['fls 4', 4],
    ['Fls. nº 15', 15],
  ])('reconhece o carimbo "%s"', (text, expected) => {
    expect(detectFolha([line(text, 40, 480)], W, H)).toBe(expected);
  });

  it('reconhece número isolado no canto superior direito', () => {
    expect(detectFolha([line('6', 35, 520), line('ESTADO DO CEARÁ', 80)], W, H)).toBe(6);
  });

  it('ignora número isolado à esquerda e citações no corpo', () => {
    expect(detectFolha([line('6', 35, 60)], W, H)).toBeNull();
    expect(detectFolha([line('conforme depoimentos às fls. 5 a 8', 400)], W, H)).toBeNull();
  });

  it('aceita carimbo no rodapé', () => {
    expect(detectFolha([line('Fls. 21', 800, 480)], W, H)).toBe(21);
  });

  it('não confunde com números de processo', () => {
    expect(detectFolha([line('Proc. 3012345-91.2026.8.06.0001', 40, 300)], W, H)).toBeNull();
  });
});

describe('resolveFolhas', () => {
  const pages = [
    { pdfPage: 1, folhaDetected: 3, folhaManual: null },
    { pdfPage: 2, folhaDetected: null, folhaManual: null },
    { pdfPage: 3, folhaDetected: 5, folhaManual: null },
    { pdfPage: 4, folhaDetected: null, folhaManual: 9 },
  ];

  it('usa detectada, infere as faltantes e respeita a manual', () => {
    expect(resolveFolhas(pages, null)).toEqual([
      { folha: 3, source: 'detected' },
      { folha: 4, source: 'inferred' },
      { folha: 5, source: 'detected' },
      { folha: 9, source: 'manual' },
    ]);
  });

  it('deslocamento vale para todas as páginas sem correção manual', () => {
    expect(resolveFolhas(pages, 10).map((r) => r.folha)).toEqual([11, 12, 13, 9]);
  });

  it('sem nenhuma informação, folha fica indefinida', () => {
    expect(resolveFolhas([{ pdfPage: 1, folhaDetected: null, folhaManual: null }], null)).toEqual([
      { folha: null, source: null },
    ]);
  });
});

describe('suggestOffset', () => {
  it('sugere o deslocamento da maioria', () => {
    const p = (pdfPage: number, folhaDetected: number | null) => ({
      pdfPage,
      folhaDetected,
      folhaManual: null,
    });
    expect(suggestOffset([p(1, 3), p(2, 4), p(3, 5), p(4, 99)])).toBe(2);
    expect(suggestOffset([p(1, 3)])).toBeNull();
    expect(suggestOffset([p(1, 3), p(2, 10)])).toBeNull();
  });
});

describe('parseFolhaStamp', () => {
  it.each([
    ['| Fls. 3 |', 3],
    ['Fl. 7\n', 7],
    ['[ 12 ]', 12],
    ['___\nFLS: 15\n—', 15],
    ['ESTADO', null],
    ['', null],
  ])('lê "%s"', (text, expected) => {
    expect(parseFolhaStamp(text)).toBe(expected);
  });
});
