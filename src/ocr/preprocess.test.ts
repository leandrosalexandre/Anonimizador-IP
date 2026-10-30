import { describe, expect, it } from 'vitest';
import {
  contrastBounds,
  otsuThreshold,
  preprocessPixels,
  removeLongLines,
  toGrayscale,
} from './preprocess';

function rgba(values: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(values.flatMap((v) => [v, v, v, 255]));
}

describe('pré-processamento', () => {
  it('converte para cinza', () => {
    const { gray } = toGrayscale(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]));
    expect(Array.from(gray)).toEqual([76, 29]);
  });

  it('estica o contraste de uma página "lavada"', () => {
    const pixels = rgba([...Array(500).fill(120), ...Array(500).fill(200)]);
    preprocessPixels(pixels, false);
    expect(pixels[0]).toBe(0);
    expect(pixels[pixels.length - 4]).toBe(255);
  });

  it('não altera página quase uniforme', () => {
    const { histogram } = toGrayscale(rgba(Array(100).fill(240)));
    expect(contrastBounds(histogram, 100)).toEqual([0, 255]);
  });

  it('binariza pelo limiar de Otsu', () => {
    const values = [...Array(300).fill(30), ...Array(700).fill(220)];
    const { histogram } = toGrayscale(rgba(values));
    const t = otsuThreshold(histogram);
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(220);
    const pixels = rgba([...values, 100, 150]);
    preprocessPixels(pixels, true);
    const out = new Set<number>();
    for (let i = 0; i < pixels.length; i += 4) out.add(pixels[i] ?? -1);
    expect([...out].sort((a, b) => a - b)).toEqual([0, 255]);
  });
});

describe('removeLongLines', () => {
  it('apaga a moldura e preserva traços curtos', () => {
    const w = 20;
    const h = 12;
    const values = Array<number>(w * h).fill(255);
    const set = (x: number, y: number) => (values[y * w + x] = 0);
    for (let x = 0; x < w; x++) set(x, 0); // borda horizontal
    for (let y = 0; y < h; y++) set(0, y); // borda vertical
    for (let y = 4; y < 8; y++) set(10, y); // "letra" curta
    const pixels = rgba(values);
    removeLongLines(pixels, w, h, 10);
    const at = (x: number, y: number) => pixels[(y * w + x) * 4];
    expect(at(5, 0)).toBe(255);
    expect(at(0, 6)).toBe(255);
    expect(at(10, 5)).toBe(0);
  });

  it('apaga também linhas levemente inclinadas', () => {
    const w = 60;
    const h = 16;
    const values = Array<number>(w * h).fill(255);
    for (let x = 0; x < w; x++) values[(2 + Math.floor(x / 25)) * w + x] = 0; // desce 1 px a cada 25
    for (let x = 20; x < 26; x++) values[12 * w + x] = 0; // traço curto, longe da linha
    const pixels = rgba(values);
    removeLongLines(pixels, w, h, 40, 2);
    let remaining = 0;
    for (let x = 0; x < w; x++)
      for (let y = 0; y < 5; y++) if (pixels[(y * w + x) * 4] === 0) remaining++;
    expect(remaining).toBe(0);
    expect(pixels[(12 * w + 22) * 4]).toBe(0);
  });
});
