/* eslint-disable @typescript-eslint/no-non-null-assertion -- laços de pixels: índices sempre válidos */
// Pré-processamento leve para o OCR (SPEC Fase 3): escala de cinza, ajuste de contraste e
// binarização opcional (Otsu). Opera direto sobre os pixels RGBA do canvas.

/** Converte para escala de cinza (luma BT.601) e devolve o histograma. */
export function toGrayscale(rgba: Uint8ClampedArray): { gray: Uint8Array; histogram: Uint32Array } {
  const gray = new Uint8Array(rgba.length / 4);
  const histogram = new Uint32Array(256);
  for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
    const v = (rgba[i]! * 299 + rgba[i + 1]! * 587 + rgba[i + 2]! * 114 + 500) / 1000;
    const g = v > 255 ? 255 : v | 0;
    gray[p] = g;
    histogram[g]!++;
  }
  return { gray, histogram };
}

/** Limites do contraste: descarta 0,5% dos pixels mais escuros e mais claros. */
export function contrastBounds(
  histogram: Uint32Array,
  total: number,
  clip = 0.005,
): [number, number] {
  const limit = total * clip;
  let low = 0;
  let acc = 0;
  while (low < 255 && acc + histogram[low]! <= limit) acc += histogram[low++]!;
  let high = 255;
  acc = 0;
  while (high > 0 && acc + histogram[high]! <= limit) acc += histogram[high--]!;
  return high - low < 32 ? [0, 255] : [low, high];
}

/** Limiar de Otsu sobre o histograma. */
export function otsuThreshold(histogram: Uint32Array): number {
  let total = 0;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    total += histogram[i]!;
    sum += i * histogram[i]!;
  }
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += histogram[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * histogram[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Aplica cinza + contraste (+ binarização) e grava de volta nos pixels RGBA. */
export function preprocessPixels(rgba: Uint8ClampedArray, binarize: boolean): void {
  const { gray, histogram } = toGrayscale(rgba);
  const [low, high] = contrastBounds(histogram, gray.length);
  const scale = 255 / (high - low);
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.max(0, Math.min(255, Math.round((v - low) * scale)));

  let threshold = -1;
  if (binarize) {
    const stretched = new Uint32Array(256);
    for (let v = 0; v < 256; v++) stretched[lut[v]!]! += histogram[v]!;
    threshold = otsuThreshold(stretched);
  }

  for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
    let v = lut[gray[p]!]!;
    if (threshold >= 0) v = v > threshold ? 255 : 0;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
    rgba[i + 3] = 255;
  }
}

/**
 * Apaga linhas retas longas (bordas de carimbos e tabelas), que fazem o Tesseract descartar o
 * texto emoldurado. Procura sequências escuras horizontais ou verticais com `minRun` pixels ou
 * mais numa faixa de ±`band` pixels (tolera páginas levemente inclinadas) e as pinta de branco.
 * Opera sobre RGBA já em escala de cinza.
 */
export function removeLongLines(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  minRun: number,
  band = 2,
  darkBelow = 140,
): void {
  const dark = new Uint8Array(width * height);
  for (let p = 0; p < dark.length; p++) dark[p] = rgba[p * 4]! < darkBelow ? 1 : 0;
  const erase = new Uint8Array(width * height);

  const scan = (outer: number, inner: number, index: (o: number, i: number) => number) => {
    const line = new Uint8Array(inner);
    for (let o = 0; o < outer; o++) {
      const from = Math.max(0, o - band);
      const to = Math.min(outer - 1, o + band);
      for (let i = 0; i < inner; i++) {
        let any = 0;
        for (let k = from; k <= to && !any; k++) any = dark[index(k, i)]!;
        line[i] = any;
      }
      let start = -1;
      for (let i = 0; i <= inner; i++) {
        const isDark = i < inner && line[i] === 1;
        if (isDark && start < 0) start = i;
        else if (!isDark && start >= 0) {
          if (i - start >= minRun) {
            for (let j = start; j < i; j++) {
              for (let k = from; k <= to; k++) {
                const idx = index(k, j);
                if (dark[idx]) erase[idx] = 1;
              }
            }
          }
          start = -1;
        }
      }
    }
  };
  scan(height, width, (y, x) => y * width + x); // horizontais
  scan(width, height, (x, y) => y * width + x); // verticais

  for (let p = 0; p < erase.length; p++) {
    if (erase[p]) rgba[p * 4] = rgba[p * 4 + 1] = rgba[p * 4 + 2] = 255;
  }
}
