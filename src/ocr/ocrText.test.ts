import { describe, expect, it } from 'vitest';
import { buildOcrText, type OcrBlock } from './ocrText';

const w = (
  text: string,
  confidence: number,
  x0 = 0,
  y0 = 0,
): {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
} => ({ text, confidence, bbox: { x0, y0, x1: x0 + 10, y1: y0 + 10 } });

describe('buildOcrText', () => {
  const blocks: OcrBlock[] = [
    {
      paragraphs: [
        {
          lines: [
            { words: [w('Fls.', 95), w('3', 60)], bbox: { x0: 480, y0: 20, x1: 540, y1: 40 } },
          ],
        },
        {
          lines: [
            { words: [w('QUE', 96), w('MAR1A', 40)], bbox: { x0: 60, y0: 300, x1: 300, y1: 320 } },
            { words: [w('declarou', 90)], bbox: { x0: 60, y0: 325, x1: 200, y1: 345 } },
          ],
        },
      ],
    },
  ];

  it('monta linhas e parágrafos', () => {
    expect(buildOcrText(blocks).text).toBe('Fls. 3\n\nQUE MAR1A\ndeclarou');
  });

  it('marca palavras de baixa confiança', () => {
    const r = buildOcrText(blocks);
    expect(r.lowConfidence.map(([s, e]) => r.text.slice(s, e))).toEqual(['3', 'MAR1A']);
  });

  it('calcula a confiança média ponderada e as linhas com posição', () => {
    const r = buildOcrText(blocks);
    expect(r.confidence).toBeGreaterThan(70);
    expect(r.confidence).toBeLessThan(90);
    expect(r.lines[0]).toMatchObject({ text: 'Fls. 3', x: 480, right: 540, y: 40 });
  });

  it('página vazia', () => {
    expect(buildOcrText([])).toEqual({ text: '', confidence: 0, lowConfidence: [], lines: [] });
  });
});
